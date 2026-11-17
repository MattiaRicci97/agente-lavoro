import { pushToUsers } from "../lib/push";
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
  teachersTable,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { teacherClassRoles, TUTOR_ROLE } from "../lib/classAccess";
import { isGradeScale, isValidGrade, SCALE_RANGE, formatGrade, type GradeScale } from "../lib/gradeScale";
import {
  diagnosisForSources,
  validateDiagnosis,
  candidateObjectivesForStudentWork,
  DiagnosisError,
  type DiagnosisDecision,
} from "../lib/diagnosis";
import { DIAGNOSIS_OUTCOMES, DIAGNOSIS_ERROR_TYPES } from "../lib/ai";
import { syncSignedEvidence } from "../lib/mastery";
import { attachToRecoveryDraft } from "../lib/recovery";
import { weightedGrade, mergeTeacherScores } from "../lib/rubric";

/**
 * Dopo la firma: la diagnosi entra nel profilo di padronanza e, se ha lasciato
 * obiettivi da riprendere, nella bozza di recupero della classe. Sono
 * conseguenze della firma, non condizioni: se falliscono, la firma resta.
 */
async function afterSignature(
  log: { error: (obj: unknown, msg: string) => void },
  input: { classId: number | null; sourceKind: "scritto" | "foto"; sourceId: number; examId: number | null; title: string },
): Promise<void> {
  try {
    const [owner] = await db
      .select({ authUserId: input.sourceKind === "scritto" ? writtenExamSubmissionsTable.authUserId : photoCorrectionsTable.authUserId })
      .from(input.sourceKind === "scritto" ? writtenExamSubmissionsTable : photoCorrectionsTable)
      .where(eq(input.sourceKind === "scritto" ? writtenExamSubmissionsTable.id : photoCorrectionsTable.id, input.sourceId));
    if (owner?.authUserId) {
      await pushToUsers([owner.authUserId], {
        title: "Correzione firmata",
        body: "Il tuo docente ha corretto il compito: trovi l'esito in Sillabo.",
        link: input.sourceKind === "scritto" ? "/studio" : "/studio/foto",
      });
    }
    await syncSignedEvidence(input.sourceKind, input.sourceId);
    await attachToRecoveryDraft(input);
  } catch (err) {
    log.error({ err, ...input }, "Profilo o recupero non aggiornati dopo la firma");
  }
}

const router: IRouter = Router();

/**
 * Chi firma e come. Il docente titolare (docente o coordinatore) firma e la
 * correzione arriva allo studente. Il tutor la prepara: resta "da confermare"
 * finche' un titolare non la conferma, e allo studente non arriva nulla.
 */
type SignPlan =
  | { ok: false; status: number; error: string }
  | { ok: true; byTutor: boolean; skipDiagnosis: boolean; patch: Record<string, unknown> };

function planSignature(input: {
  role: string | undefined;
  teacherId: number;
  currentStatus: string;
  scale: string;
  grade: number | null;
  feedback: string;
  decisions: number;
}): SignPlan {
  if (!input.role) return { ok: false, status: 404, error: "Non trovato" };
  const scale: GradeScale = isGradeScale(input.scale) ? input.scale : "decimi";
  if (input.grade !== null && !isValidGrade(input.grade, scale)) {
    const r = SCALE_RANGE[scale];
    return { ok: false, status: 400, error: `Il voto va da ${formatGrade(r.min, scale)} a ${formatGrade(r.max, scale)}` };
  }
  const byTutor = input.role === TUTOR_ROLE;
  if (byTutor) {
    if (input.currentStatus === "validata") {
      return { ok: false, status: 409, error: "Questa correzione è già stata firmata dal docente" };
    }
    return {
      ok: true,
      byTutor,
      skipDiagnosis: false,
      patch: {
        validationStatus: "da_confermare",
        teacherGrade: input.grade,
        teacherFeedback: input.feedback,
        preparedByTeacherId: input.teacherId,
      },
    };
  }
  return {
    ok: true,
    byTutor,
    // Confermando cio' che ha preparato il tutor, la sua diagnosi resta com'e'.
    skipDiagnosis: input.currentStatus === "da_confermare" && input.decisions === 0,
    patch: {
      validationStatus: "validata",
      teacherGrade: input.grade,
      teacherFeedback: input.feedback,
      validatedByTeacherId: input.teacherId,
      validatedAt: new Date(),
    },
  };
}

/** I nomi dei tutor che hanno preparato le correzioni. */
async function tutorNames(ids: Array<number | null>): Promise<Map<number, string>> {
  const wanted = Array.from(new Set(ids.filter((id): id is number => id !== null)));
  if (!wanted.length) return new Map();
  const rows = await db.select({ id: teachersTable.id, name: teachersTable.name }).from(teachersTable).where(inArray(teachersTable.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

const PENDING = ["da_validare", "da_confermare"];

const DecisionSchema = z.object({
  id: z.number().int().positive(),
  objectiveId: z.number().int().positive().nullable().optional(),
  outcome: z.enum(DIAGNOSIS_OUTCOMES).optional(),
  errorType: z.enum(DIAGNOSIS_ERROR_TYPES).nullable().optional(),
  discard: z.boolean().optional(),
});

const ValidateSchema = z.object({
  /** Nella scala dell'istituto: decimi, trentesimi (31 = 30 e lode) o centesimi. */
  grade: z.number().int().min(0).max(100).nullable(),
  feedback: z.string().trim().max(4000).optional().default(""),
  /** Correzioni alla diagnosi: le righe non citate vengono confermate come proposte. */
  diagnosis: z.array(DecisionSchema).max(60).optional().default([]),
  /** Punteggi per criterio corretti dal docente (solo compiti con griglia). */
  rubricScores: z
    .array(z.object({ criterion: z.string().trim().min(1).max(80), score: z.number().int().min(1).max(10) }))
    .max(12)
    .optional()
    .default([]),
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
 * una valutazione ufficiale. Il titolare vede anche le correzioni preparate
 * dai tutor, da confermare; il tutor vede solo quelle ancora da preparare.
 */
router.get("/validations/pending", requireTeacher, async (req, res): Promise<void> => {
  const roles = await teacherClassRoles(req.teacher!.id);
  const classIds = Array.from(roles.keys());
  if (!classIds.length) {
    res.json({ photoCorrections: [], oralSessions: [], writtenSubmissions: [], total: 0 });
    return;
  }
  /** Il titolare vede tutto; il tutor non vede cio' che aspetta un titolare. */
  const visible = (classId: number | null, status: string) =>
    classId !== null && roles.has(classId) && !(status === "da_confermare" && roles.get(classId) === TUTOR_ROLE);
  const signer = (classId: number | null) => (classId !== null && roles.get(classId) === TUTOR_ROLE ? "tutor" : "docente");

  const photos = (
    await db
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
        validationStatus: photoCorrectionsTable.validationStatus,
        gradeScale: photoCorrectionsTable.gradeScale,
        teacherGrade: photoCorrectionsTable.teacherGrade,
        teacherFeedback: photoCorrectionsTable.teacherFeedback,
        preparedByTeacherId: photoCorrectionsTable.preparedByTeacherId,
      })
      .from(photoCorrectionsTable)
      .innerJoin(classesTable, eq(classesTable.id, photoCorrectionsTable.classId))
      .where(and(inArray(photoCorrectionsTable.classId, classIds), inArray(photoCorrectionsTable.validationStatus, PENDING)))
      .orderBy(desc(photoCorrectionsTable.createdAt))
      .limit(50)
  ).filter((p) => visible(p.classId, p.validationStatus));

  // Interrogazioni completate sui materiali assegnati alle classi del docente.
  const links = await db
    .select({ materialId: materialClassesTable.materialId, classId: materialClassesTable.classId })
    .from(materialClassesTable)
    .where(inArray(materialClassesTable.classId, classIds));
  const materialIds = Array.from(new Set(links.map((l) => l.materialId)));
  /** Per le consegne nate prima che si salvasse la classe: la prima classe del docente col materiale. */
  const fallbackClass = new Map<number, number>();
  for (const l of links) if (!fallbackClass.has(l.materialId)) fallbackClass.set(l.materialId, l.classId);

  const orals = (
    materialIds.length
      ? await db
          .select({
            id: oralSessionsTable.id,
            materialId: oralSessionsTable.materialId,
            classId: oralSessionsTable.classId,
            studentName: oralSessionsTable.studentName,
            grade: oralSessionsTable.grade,
            feedback: oralSessionsTable.feedback,
            createdAt: oralSessionsTable.createdAt,
            materialTitle: materialsTable.title,
            subject: materialsTable.subject,
            validationStatus: oralSessionsTable.validationStatus,
            gradeScale: oralSessionsTable.gradeScale,
            teacherGrade: oralSessionsTable.teacherGrade,
            teacherFeedback: oralSessionsTable.teacherFeedback,
            preparedByTeacherId: oralSessionsTable.preparedByTeacherId,
          })
          .from(oralSessionsTable)
          .innerJoin(materialsTable, eq(materialsTable.id, oralSessionsTable.materialId))
          .where(
            and(
              inArray(oralSessionsTable.materialId, materialIds),
              eq(oralSessionsTable.status, "completata"),
              inArray(oralSessionsTable.validationStatus, PENDING),
            ),
          )
          .orderBy(desc(oralSessionsTable.createdAt))
          .limit(50)
      : []
  )
    .map((o) => ({ ...o, classId: o.classId !== null && roles.has(o.classId) ? o.classId : (fallbackClass.get(o.materialId) ?? null) }))
    .filter((o) => visible(o.classId, o.validationStatus));

  // Compiti scritti consegnati dagli studenti delle classi del docente.
  const writtenSubmissions = (
    materialIds.length
      ? await db
          .select({
            id: writtenExamSubmissionsTable.id,
            studentName: writtenExamSubmissionsTable.studentName,
            answer: writtenExamSubmissionsTable.answer,
            audioObjectPath: writtenExamSubmissionsTable.audioObjectPath,
            audioSeconds: writtenExamSubmissionsTable.audioSeconds,
            grade: writtenExamSubmissionsTable.aiGrade,
            feedback: writtenExamSubmissionsTable.aiFeedback,
            createdAt: writtenExamSubmissionsTable.createdAt,
            examType: writtenExamsTable.examType,
            prompt: writtenExamsTable.prompt,
            rubric: writtenExamsTable.rubric,
            rubricStatus: writtenExamsTable.rubricStatus,
            aiRubricScores: writtenExamSubmissionsTable.aiRubricScores,
            teacherRubricScores: writtenExamSubmissionsTable.teacherRubricScores,
            materialTitle: materialsTable.title,
            subject: materialsTable.subject,
            classId: writtenExamSubmissionsTable.classId,
            materialId: materialsTable.id,
            gradeLevel: materialsTable.gradeLevel,
            validationStatus: writtenExamSubmissionsTable.validationStatus,
            gradeScale: writtenExamSubmissionsTable.gradeScale,
            teacherGrade: writtenExamSubmissionsTable.teacherGrade,
            teacherFeedback: writtenExamSubmissionsTable.teacherFeedback,
            preparedByTeacherId: writtenExamSubmissionsTable.preparedByTeacherId,
          })
          .from(writtenExamSubmissionsTable)
          .innerJoin(writtenExamsTable, eq(writtenExamsTable.id, writtenExamSubmissionsTable.examId))
          .innerJoin(materialsTable, eq(materialsTable.id, writtenExamsTable.materialId))
          .where(
            and(
              inArray(writtenExamsTable.materialId, materialIds),
              inArray(writtenExamSubmissionsTable.validationStatus, PENDING),
            ),
          )
          .orderBy(desc(writtenExamSubmissionsTable.createdAt))
          .limit(50)
      : []
  )
    .map((w) => ({ ...w, classId: w.classId !== null && roles.has(w.classId) ? w.classId : (fallbackClass.get(w.materialId) ?? null) }))
    .filter((w) => visible(w.classId, w.validationStatus));

  const names = await tutorNames([...photos, ...orals, ...writtenSubmissions].map((x) => x.preparedByTeacherId));
  /** Cosa ha preparato il tutor, se c'e' una correzione da confermare. */
  const prepared = (x: { validationStatus: string; teacherGrade: number | null; teacherFeedback: string | null; preparedByTeacherId: number | null }) =>
    x.validationStatus === "da_confermare"
      ? { tutorName: (x.preparedByTeacherId !== null && names.get(x.preparedByTeacherId)) || "Tutor", grade: x.teacherGrade, feedback: x.teacherFeedback ?? "" }
      : null;
  const strip = <T extends { teacherGrade: unknown; teacherFeedback: unknown; preparedByTeacherId: unknown }>(x: T) => {
    const { teacherGrade: _g, teacherFeedback: _f, preparedByTeacherId: _p, ...rest } = x;
    return rest;
  };

  // La diagnosi proposta viaggia con la correzione, insieme agli obiettivi
  // tra cui il docente puo' scegliere se vuole correggerla.
  const photoDiagnosis = await diagnosisForSources("foto", photos.map((p) => p.id));
  const writtenDiagnosis = await diagnosisForSources("scritto", writtenSubmissions.map((w) => w.id));
  const options = new Map<string, Array<{ id: number; code: string; title: string }>>();

  const photosOut = [];
  for (const p of photos) {
    photosOut.push({
      ...strip(p),
      signer: signer(p.classId),
      prepared: prepared(p),
      diagnosis: photoDiagnosis.get(p.id) ?? [],
      objectiveOptions: await objectiveOptionsFor(options, {
        classId: p.classId,
        subject: p.subject,
        gradeLevel: p.gradeLevel,
        materialId: p.materialId,
      }),
    });
  }
  const oralsOut = orals.map((o) => ({ ...strip(o), signer: signer(o.classId), prepared: prepared(o) }));
  const writtenOut = [];
  for (const w of writtenSubmissions) {
    const { rubric, rubricStatus, aiRubricScores, teacherRubricScores, ...rest } = w;
    const inForce = rubric && rubricStatus === "approvata" ? rubric : null;
    const tutorScores = w.validationStatus === "da_confermare" ? teacherRubricScores : null;
    writtenOut.push({
      ...strip(rest),
      signer: signer(w.classId),
      prepared: prepared(w),
      rubric: inForce,
      // Se il tutor ha gia' corretto i punteggi, il titolare parte dai suoi.
      rubricScores: inForce ? (tutorScores ?? aiRubricScores ?? []) : [],
      rubricSuggestedGrade: inForce ? weightedGrade(inForce, aiRubricScores ?? []) : null,
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
    oralSessions: oralsOut,
    writtenSubmissions: writtenOut,
    total: photosOut.length + oralsOut.length + writtenOut.length,
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
    .select({
      id: writtenExamSubmissionsTable.id,
      classId: writtenExamSubmissionsTable.classId,
      materialId: writtenExamsTable.materialId,
      rubric: writtenExamsTable.rubric,
      rubricStatus: writtenExamsTable.rubricStatus,
      aiRubricScores: writtenExamSubmissionsTable.aiRubricScores,
      teacherRubricScores: writtenExamSubmissionsTable.teacherRubricScores,
      validationStatus: writtenExamSubmissionsTable.validationStatus,
      gradeScale: writtenExamSubmissionsTable.gradeScale,
    })
    .from(writtenExamSubmissionsTable)
    .innerJoin(writtenExamsTable, eq(writtenExamsTable.id, writtenExamSubmissionsTable.examId))
    .where(eq(writtenExamSubmissionsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Consegna non trovata" });
    return;
  }

  // Il materiale dev'essere assegnato a una classe del docente.
  const roles = await teacherClassRoles(req.teacher!.id);
  const classIds = Array.from(roles.keys());
  const [link] = classIds.length
    ? await db
        .select({ classId: materialClassesTable.classId })
        .from(materialClassesTable)
        .where(and(eq(materialClassesTable.materialId, row.materialId), inArray(materialClassesTable.classId, classIds)))
    : [];
  if (!link) {
    res.status(404).json({ error: "Consegna non trovata" });
    return;
  }
  const classId = row.classId !== null && roles.has(row.classId) ? row.classId : link.classId;

  const plan = planSignature({
    role: roles.get(classId),
    teacherId: req.teacher!.id,
    currentStatus: row.validationStatus,
    scale: row.gradeScale,
    grade: parsed.data.grade,
    feedback: parsed.data.feedback,
    decisions: parsed.data.diagnosis.length,
  });
  if (!plan.ok) {
    res.status(plan.status).json({ error: plan.status === 404 ? "Consegna non trovata" : plan.error });
    return;
  }

  if (
    !plan.skipDiagnosis &&
    !(await applyDiagnosis(res, { sourceKind: "scritto", sourceId: id, teacherId: req.teacher!.id, decisions: parsed.data.diagnosis }))
  ) {
    return;
  }

  const inForce = row.rubric && row.rubricStatus === "approvata" ? row.rubric : null;
  const [updated] = await db
    .update(writtenExamSubmissionsTable)
    .set({
      ...plan.patch,
      // Con la firma i punteggi per criterio diventano del docente (o del tutor,
      // da confermare). Chi conferma parte dai punteggi gia' sistemati dal tutor.
      teacherRubricScores: inForce
        ? mergeTeacherScores(
            inForce,
            (row.validationStatus === "da_confermare" ? row.teacherRubricScores : null) ?? row.aiRubricScores ?? [],
            parsed.data.rubricScores,
          )
        : null,
    })
    .where(eq(writtenExamSubmissionsTable.id, id))
    .returning();

  if (!plan.byTutor) {
    const [exam] = await db
      .select({ examType: writtenExamsTable.examType, title: materialsTable.title })
      .from(writtenExamsTable)
      .innerJoin(materialsTable, eq(materialsTable.id, writtenExamsTable.materialId))
      .where(eq(writtenExamsTable.id, updated.examId));
    await afterSignature(req.log, {
      classId: updated.classId,
      sourceKind: "scritto",
      sourceId: id,
      examId: updated.examId,
      title: exam ? `${exam.title} (${exam.examType})` : "Compito scritto",
    });
  }

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

  const roles = await teacherClassRoles(req.teacher!.id);
  const [row] = await db
    .select({
      id: photoCorrectionsTable.id,
      classId: photoCorrectionsTable.classId,
      validationStatus: photoCorrectionsTable.validationStatus,
      gradeScale: photoCorrectionsTable.gradeScale,
    })
    .from(photoCorrectionsTable)
    .where(eq(photoCorrectionsTable.id, id));

  if (!row || !row.classId || !roles.has(row.classId)) {
    res.status(404).json({ error: "Correzione non trovata" });
    return;
  }

  const plan = planSignature({
    role: roles.get(row.classId),
    teacherId: req.teacher!.id,
    currentStatus: row.validationStatus,
    scale: row.gradeScale,
    grade: parsed.data.grade,
    feedback: parsed.data.feedback,
    decisions: parsed.data.diagnosis.length,
  });
  if (!plan.ok) {
    res.status(plan.status).json({ error: plan.error });
    return;
  }

  if (
    !plan.skipDiagnosis &&
    !(await applyDiagnosis(res, { sourceKind: "foto", sourceId: id, teacherId: req.teacher!.id, decisions: parsed.data.diagnosis }))
  ) {
    return;
  }

  const [updated] = await db.update(photoCorrectionsTable).set(plan.patch).where(eq(photoCorrectionsTable.id, id)).returning();

  if (!plan.byTutor) {
    await afterSignature(req.log, {
      classId: updated.classId,
      sourceKind: "foto",
      sourceId: id,
      examId: null,
      title: `Compiti fotografati di ${updated.subject}`,
    });
  }

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
    .select({
      id: oralSessionsTable.id,
      materialId: oralSessionsTable.materialId,
      classId: oralSessionsTable.classId,
      validationStatus: oralSessionsTable.validationStatus,
      gradeScale: oralSessionsTable.gradeScale,
    })
    .from(oralSessionsTable)
    .where(eq(oralSessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Interrogazione non trovata" });
    return;
  }

  // Il materiale dev'essere assegnato a una classe del docente.
  const roles = await teacherClassRoles(req.teacher!.id);
  const classIds = Array.from(roles.keys());
  const [link] = classIds.length
    ? await db
        .select({ classId: materialClassesTable.classId })
        .from(materialClassesTable)
        .where(and(eq(materialClassesTable.materialId, session.materialId), inArray(materialClassesTable.classId, classIds)))
    : [];
  if (!link) {
    res.status(404).json({ error: "Interrogazione non trovata" });
    return;
  }
  const classId = session.classId !== null && roles.has(session.classId) ? session.classId : link.classId;

  const plan = planSignature({
    role: roles.get(classId),
    teacherId: req.teacher!.id,
    currentStatus: session.validationStatus,
    scale: session.gradeScale,
    grade: parsed.data.grade,
    feedback: parsed.data.feedback,
    decisions: 0,
  });
  if (!plan.ok) {
    res.status(plan.status).json({ error: plan.error });
    return;
  }

  const [updated] = await db.update(oralSessionsTable).set(plan.patch).where(eq(oralSessionsTable.id, id)).returning();
  res.json(updated);
});

export default router;
