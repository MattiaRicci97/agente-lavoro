import { Router, type IRouter, type Response } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  materialsTable,
  materialClassesTable,
  photoCorrectionsTable,
  oralSessionsTable,
  writtenExamsTable,
  writtenExamSubmissionsTable,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { teacherClassIds } from "../lib/classAccess";
import {
  diagnosisForSources,
  validateDiagnosis,
  candidateObjectivesForStudentWork,
  DiagnosisError,
  type DiagnosisDecision,
} from "../lib/diagnosis";
import { DIAGNOSIS_OUTCOMES, DIAGNOSIS_ERROR_TYPES } from "../lib/ai";

const router: IRouter = Router();

const DecisionSchema = z.object({
  id: z.number().int().positive(),
  objectiveId: z.number().int().positive().nullable().optional(),
  outcome: z.enum(DIAGNOSIS_OUTCOMES).optional(),
  errorType: z.enum(DIAGNOSIS_ERROR_TYPES).nullable().optional(),
  discard: z.boolean().optional(),
});

const ValidateSchema = z.object({
  grade: z.number().int().min(1).max(10).nullable(),
  feedback: z.string().trim().max(4000).optional().default(""),
  /** Correzioni alla diagnosi: le righe non citate vengono confermate come proposte. */
  diagnosis: z.array(DecisionSchema).max(60).optional().default([]),
});

/**
 * Gli obiettivi tra cui il docente puo' scegliere per correggere una diagnosi.
 * Una lista per classe e materia, condivisa dalle correzioni della stessa coda.
 */
async function objectiveOptionsFor(
  cache: Map<string, Array<{ id: number; code: string; title: string }>>,
  input: { classId: number | null; subject: string; gradeLevel: string; materialId?: number | null },
) {
  const key = `${input.classId}|${input.subject}|${input.materialId ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const list = (await candidateObjectivesForStudentWork(input)).map((o) => ({ id: o.id, code: o.code, title: o.title }));
  cache.set(key, list);
  return list;
}

async function applyDiagnosis(
  res: Response,
  input: { sourceKind: "scritto" | "foto"; sourceId: number; teacherId: number; decisions: DiagnosisDecision[] },
): Promise<boolean> {
  try {
    await validateDiagnosis(input);
    return true;
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(400).json({ error: err.message });
      return false;
    }
    throw err;
  }
}

/**
 * Proposte di valutazione in attesa del visto del docente.
 * L'AI prepara, il docente decide: finché non firma, per lo studente non è
 * una valutazione ufficiale.
 */
router.get("/validations/pending", requireTeacher, async (req, res): Promise<void> => {
  const classIds = await teacherClassIds(req.teacher!.id);
  if (!classIds.length) {
    res.json({ photoCorrections: [], oralSessions: [], writtenSubmissions: [], total: 0 });
    return;
  }

  const photos = await db
    .select({
      id: photoCorrectionsTable.id,
      studentName: photoCorrectionsTable.studentName,
      subject: photoCorrectionsTable.subject,
      gradeLevel: photoCorrectionsTable.gradeLevel,
      classId: photoCorrectionsTable.classId,
      materialId: photoCorrectionsTable.materialId,
      assignmentPrompt: photoCorrectionsTable.assignmentPrompt,
      imageObjectPath: photoCorrectionsTable.imageObjectPath,
      transcription: photoCorrectionsTable.transcription,
      grade: photoCorrectionsTable.grade,
      feedback: photoCorrectionsTable.feedback,
      strengths: photoCorrectionsTable.strengths,
      improvements: photoCorrectionsTable.improvements,
      createdAt: photoCorrectionsTable.createdAt,
      className: classesTable.name,
    })
    .from(photoCorrectionsTable)
    .innerJoin(classesTable, eq(classesTable.id, photoCorrectionsTable.classId))
    .where(
      and(
        inArray(photoCorrectionsTable.classId, classIds),
        eq(photoCorrectionsTable.validationStatus, "da_validare"),
      ),
    )
    .orderBy(desc(photoCorrectionsTable.createdAt))
    .limit(50);

  // Interrogazioni completate sui materiali assegnati alle classi del docente.
  const links = await db
    .select({ materialId: materialClassesTable.materialId })
    .from(materialClassesTable)
    .where(inArray(materialClassesTable.classId, classIds));
  const materialIds = Array.from(new Set(links.map((l) => l.materialId)));

  const orals = materialIds.length
    ? await db
        .select({
          id: oralSessionsTable.id,
          materialId: oralSessionsTable.materialId,
          studentName: oralSessionsTable.studentName,
          grade: oralSessionsTable.grade,
          feedback: oralSessionsTable.feedback,
          createdAt: oralSessionsTable.createdAt,
          materialTitle: materialsTable.title,
          subject: materialsTable.subject,
        })
        .from(oralSessionsTable)
        .innerJoin(materialsTable, eq(materialsTable.id, oralSessionsTable.materialId))
        .where(
          and(
            inArray(oralSessionsTable.materialId, materialIds),
            eq(oralSessionsTable.status, "completata"),
            eq(oralSessionsTable.validationStatus, "da_validare"),
          ),
        )
        .orderBy(desc(oralSessionsTable.createdAt))
        .limit(50)
    : [];

  // Compiti scritti consegnati dagli studenti delle classi del docente.
  const writtenSubmissions = materialIds.length
    ? await db
        .select({
          id: writtenExamSubmissionsTable.id,
          studentName: writtenExamSubmissionsTable.studentName,
          answer: writtenExamSubmissionsTable.answer,
          grade: writtenExamSubmissionsTable.aiGrade,
          feedback: writtenExamSubmissionsTable.aiFeedback,
          createdAt: writtenExamSubmissionsTable.createdAt,
          examType: writtenExamsTable.examType,
          prompt: writtenExamsTable.prompt,
          materialTitle: materialsTable.title,
          subject: materialsTable.subject,
          classId: writtenExamSubmissionsTable.classId,
          materialId: materialsTable.id,
          gradeLevel: materialsTable.gradeLevel,
        })
        .from(writtenExamSubmissionsTable)
        .innerJoin(writtenExamsTable, eq(writtenExamsTable.id, writtenExamSubmissionsTable.examId))
        .innerJoin(materialsTable, eq(materialsTable.id, writtenExamsTable.materialId))
        .where(
          and(
            inArray(writtenExamsTable.materialId, materialIds),
            eq(writtenExamSubmissionsTable.validationStatus, "da_validare"),
          ),
        )
        .orderBy(desc(writtenExamSubmissionsTable.createdAt))
        .limit(50)
    : [];

  // La diagnosi proposta viaggia con la correzione, insieme agli obiettivi
  // tra cui il docente puo' scegliere se vuole correggerla.
  const photoDiagnosis = await diagnosisForSources("foto", photos.map((p) => p.id));
  const writtenDiagnosis = await diagnosisForSources("scritto", writtenSubmissions.map((w) => w.id));
  const options = new Map<string, Array<{ id: number; code: string; title: string }>>();

  const photosOut = [];
  for (const p of photos) {
    photosOut.push({
      ...p,
      diagnosis: photoDiagnosis.get(p.id) ?? [],
      objectiveOptions: await objectiveOptionsFor(options, {
        classId: p.classId,
        subject: p.subject,
        gradeLevel: p.gradeLevel,
        materialId: p.materialId,
      }),
    });
  }
  const writtenOut = [];
  for (const w of writtenSubmissions) {
    writtenOut.push({
      ...w,
      diagnosis: writtenDiagnosis.get(w.id) ?? [],
      objectiveOptions: await objectiveOptionsFor(options, {
        classId: w.classId,
        subject: w.subject,
        gradeLevel: w.gradeLevel,
        materialId: w.materialId,
      }),
    });
  }

  res.json({
    photoCorrections: photosOut,
    oralSessions: orals,
    writtenSubmissions: writtenOut,
    total: photos.length + orals.length + writtenSubmissions.length,
  });
});

/** Il docente firma (confermando o correggendo) un compito scritto consegnato. */
router.post("/written-submissions/:id/validate", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = ValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ id: writtenExamSubmissionsTable.id, materialId: writtenExamsTable.materialId })
    .from(writtenExamSubmissionsTable)
    .innerJoin(writtenExamsTable, eq(writtenExamsTable.id, writtenExamSubmissionsTable.examId))
    .where(eq(writtenExamSubmissionsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Consegna non trovata" });
    return;
  }

  // Il materiale dev'essere assegnato a una classe del docente.
  const classIds = await teacherClassIds(req.teacher!.id);
  const [link] = classIds.length
    ? await db
        .select({ classId: materialClassesTable.classId })
        .from(materialClassesTable)
        .where(
          and(
            eq(materialClassesTable.materialId, row.materialId),
            inArray(materialClassesTable.classId, classIds),
          ),
        )
    : [];
  if (!link) {
    res.status(404).json({ error: "Consegna non trovata" });
    return;
  }

  if (!(await applyDiagnosis(res, { sourceKind: "scritto", sourceId: id, teacherId: req.teacher!.id, decisions: parsed.data.diagnosis }))) {
    return;
  }

  const [updated] = await db
    .update(writtenExamSubmissionsTable)
    .set({
      validationStatus: "validata",
      teacherGrade: parsed.data.grade,
      teacherFeedback: parsed.data.feedback,
      validatedByTeacherId: req.teacher!.id,
      validatedAt: new Date(),
    })
    .where(eq(writtenExamSubmissionsTable.id, id))
    .returning();

  res.json(updated);
});

/** Il docente firma (confermando o correggendo) la proposta su un compito fotografato. */
router.post("/photo-corrections/:id/validate", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = ValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const classIds = await teacherClassIds(req.teacher!.id);
  const [row] = await db
    .select({ id: photoCorrectionsTable.id, classId: photoCorrectionsTable.classId })
    .from(photoCorrectionsTable)
    .where(eq(photoCorrectionsTable.id, id));

  if (!row || !row.classId || !classIds.includes(row.classId)) {
    res.status(404).json({ error: "Correzione non trovata" });
    return;
  }

  if (!(await applyDiagnosis(res, { sourceKind: "foto", sourceId: id, teacherId: req.teacher!.id, decisions: parsed.data.diagnosis }))) {
    return;
  }

  const [updated] = await db
    .update(photoCorrectionsTable)
    .set({
      validationStatus: "validata",
      teacherGrade: parsed.data.grade,
      teacherFeedback: parsed.data.feedback,
      validatedByTeacherId: req.teacher!.id,
      validatedAt: new Date(),
    })
    .where(eq(photoCorrectionsTable.id, id))
    .returning();

  res.json(updated);
});

/** Il docente firma (confermando o correggendo) la proposta su un'interrogazione. */
router.post("/oral-sessions/:id/validate", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = ValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db
    .select({ id: oralSessionsTable.id, materialId: oralSessionsTable.materialId })
    .from(oralSessionsTable)
    .where(eq(oralSessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Interrogazione non trovata" });
    return;
  }

  // Il materiale dev'essere assegnato a una classe del docente.
  const classIds = await teacherClassIds(req.teacher!.id);
  const [link] = classIds.length
    ? await db
        .select({ classId: materialClassesTable.classId })
        .from(materialClassesTable)
        .where(
          and(
            eq(materialClassesTable.materialId, session.materialId),
            inArray(materialClassesTable.classId, classIds),
          ),
        )
    : [];
  if (!link) {
    res.status(404).json({ error: "Interrogazione non trovata" });
    return;
  }

  const [updated] = await db
    .update(oralSessionsTable)
    .set({
      validationStatus: "validata",
      teacherGrade: parsed.data.grade,
      teacherFeedback: parsed.data.feedback,
      validatedByTeacherId: req.teacher!.id,
      validatedAt: new Date(),
    })
    .where(eq(oralSessionsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
