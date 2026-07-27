import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  materialsTable,
  materialClassesTable,
  photoCorrectionsTable,
  oralSessionsTable,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const ValidateSchema = z.object({
  grade: z.number().int().min(1).max(10).nullable(),
  feedback: z.string().trim().max(4000).optional().default(""),
});

/** Id delle classi del docente autenticato. */
async function teacherClassIds(teacherId: number): Promise<number[]> {
  const rows = await db
    .select({ id: classesTable.id })
    .from(classesTable)
    .where(eq(classesTable.teacherId, teacherId));
  return rows.map((r) => r.id);
}

/**
 * Proposte di valutazione in attesa del visto del docente.
 * L'AI prepara, il docente decide: finché non firma, per lo studente non è
 * una valutazione ufficiale.
 */
router.get("/validations/pending", requireTeacher, async (req, res): Promise<void> => {
  const classIds = await teacherClassIds(req.teacher!.id);
  if (!classIds.length) {
    res.json({ photoCorrections: [], oralSessions: [], total: 0 });
    return;
  }

  const photos = await db
    .select({
      id: photoCorrectionsTable.id,
      studentName: photoCorrectionsTable.studentName,
      subject: photoCorrectionsTable.subject,
      gradeLevel: photoCorrectionsTable.gradeLevel,
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

  res.json({
    photoCorrections: photos,
    oralSessions: orals,
    total: photos.length + orals.length,
  });
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
