import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, count } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  materialsTable,
  writtenExamsTable,
  writtenExamSubmissionsTable,
  teachersTable,
  materialClassesTable,
} from "@sillabo/db";
import { GenerateWrittenExamParams } from "@sillabo/api-zod";
import { generateWrittenExamPrompt, gradeWrittenExam } from "../lib/ai";
import { requireAuth, requireTeacher, findApprovedStudentForMaterial } from "../middlewares/auth";
import { teacherCanManageMaterial } from "../lib/materialAccess";
import { announceToClasses } from "../lib/classFeed";
import { dropEvidenceForSources } from "../lib/mastery";
import { recoveryRecipientIds, recoveryObjectiveIds } from "../lib/recovery";
import {
  candidateObjectivesForStudentWork,
  toCandidates,
  storeDiagnosis,
  diagnosisForSources,
  deleteDiagnosisForSources,
} from "../lib/diagnosis";

const router: IRouter = Router();

const AssignSchema = z.object({
  examType: z.enum(["tema", "versione", "problema"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  instructions: z.string().trim().max(1000).nullable().optional(),
});

const SubmitSchema = z.object({
  studentAnswer: z.string().trim().min(1).max(20000),
});

/** Traccia del compito, senza i dati di consegna di nessuno. */
function assignmentView(exam: typeof writtenExamsTable.$inferSelect) {
  return {
    id: exam.id,
    materialId: exam.materialId,
    examType: exam.examType,
    prompt: exam.prompt,
    dueDate: exam.dueDate,
    instructions: exam.instructions,
    createdAt: exam.createdAt,
  };
}

/**
 * Compiti assegnati su questo materiale.
 *
 * Il docente vede quanti studenti hanno consegnato; lo studente vede solo
 * la propria consegna, e il voto solo dopo il visto del docente.
 */
router.get("/materials/:id/written-exams", requireAuth, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const exams = await db
    .select()
    .from(writtenExamsTable)
    .where(eq(writtenExamsTable.materialId, materialId))
    .orderBy(desc(writtenExamsTable.createdAt));

  if (!exams.length) {
    res.json([]);
    return;
  }
  const examIds = exams.map((e) => e.id);

  const [teacher] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, req.authUserId!));

  if (teacher) {
    if (!(await teacherCanManageMaterial(teacher.id, materialId))) {
      res.status(404).json({ error: "Materiale non trovato" });
      return;
    }

    const counts = await db
      .select({
        examId: writtenExamSubmissionsTable.examId,
        submissions: count(),
      })
      .from(writtenExamSubmissionsTable)
      .where(inArray(writtenExamSubmissionsTable.examId, examIds))
      .groupBy(writtenExamSubmissionsTable.examId);
    const byExam = new Map(counts.map((c) => [c.examId, c.submissions]));

    const pending = await db
      .select({ examId: writtenExamSubmissionsTable.examId, toValidate: count() })
      .from(writtenExamSubmissionsTable)
      .where(
        and(
          inArray(writtenExamSubmissionsTable.examId, examIds),
          eq(writtenExamSubmissionsTable.validationStatus, "da_validare"),
        ),
      )
      .groupBy(writtenExamSubmissionsTable.examId);
    const pendingByExam = new Map(pending.map((c) => [c.examId, c.toValidate]));

    res.json(
      exams.map((e) => ({
        ...assignmentView(e),
        submissionsCount: byExam.get(e.id) ?? 0,
        toValidateCount: pendingByExam.get(e.id) ?? 0,
      })),
    );
    return;
  }

  // Studente: deve appartenere a una classe con accesso al materiale.
  const student = await findApprovedStudentForMaterial(req.authUserId!, materialId);
  if (!student) {
    res.json([]);
    return;
  }

  // Una verifica di riscontro riguarda solo chi ha fatto quel recupero.
  const visibleExams = [];
  for (const e of exams) {
    if (e.recoverySetId === null || (await recoveryRecipientIds(e.recoverySetId)).includes(student.id)) {
      visibleExams.push(e);
    }
  }

  const mine = await db
    .select()
    .from(writtenExamSubmissionsTable)
    .where(
      and(
        inArray(writtenExamSubmissionsTable.examId, examIds),
        eq(writtenExamSubmissionsTable.authUserId, req.authUserId!),
      ),
    );
  const mineByExam = new Map(mine.map((s) => [s.examId, s]));
  // La diagnosi segue il voto: prima della firma non c'e'.
  const diagnosis = await diagnosisForSources(
    "scritto",
    mine.filter((s) => s.validationStatus === "validata").map((s) => s.id),
    { onlyValidated: true },
  );

  res.json(
    visibleExams.map((e) => {
      const sub = mineByExam.get(e.id);
      return {
        ...assignmentView(e),
        isFollowup: e.recoverySetId !== null,
        mySubmission: sub
          ? {
              id: sub.id,
              answer: sub.answer,
              status: sub.validationStatus,
              // Prima del visto lo studente non riceve nessun voto.
              grade: sub.validationStatus === "validata" ? sub.teacherGrade : null,
              feedback: sub.validationStatus === "validata" ? sub.teacherFeedback : null,
              diagnosis: (diagnosis.get(sub.id) ?? []).map((d) => ({
                exercise: d.exercise,
                objective: d.teacher?.objective ?? null,
                outcome: d.teacher?.outcome ?? d.ai.outcome,
                errorType: d.teacher?.errorType ?? null,
                evidence: d.ai.evidence,
              })),
              createdAt: sub.createdAt,
            }
          : null,
      };
    }),
  );
});

/** Il docente assegna un compito: l'AI scrive la traccia, lui la pubblica. */
router.post("/materials/:id/written-exams", requireTeacher, async (req, res): Promise<void> => {
  const params = GenerateWrittenExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AssignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await teacherCanManageMaterial(req.teacher!.id, params.data.id))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, params.data.id));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  req.log.info({ materialId: material.id, examType: parsed.data.examType }, "Generating written exam");

  const { prompt } = await generateWrittenExamPrompt(
    parsed.data.examType,
    material.title,
    material.subject,
    material.gradeLevel,
    material.content,
  );

  const [exam] = await db
    .insert(writtenExamsTable)
    .values({
      materialId: material.id,
      examType: parsed.data.examType,
      prompt,
      assignedByTeacherId: req.teacher!.id,
      dueDate: parsed.data.dueDate ?? null,
      instructions: parsed.data.instructions ?? null,
      status: "assegnato",
    })
    .returning();

  // Il compito assegnato compare sulla bacheca delle classi collegate.
  const linked = await db
    .select({ classId: materialClassesTable.classId })
    .from(materialClassesTable)
    .where(eq(materialClassesTable.materialId, material.id));
  await announceToClasses({
    classIds: linked.map((l) => l.classId),
    teacherId: req.teacher!.id,
    authorName: req.teacher!.name,
    kind: "compito",
    title: `Compito assegnato: ${parsed.data.examType} su ${material.title}`,
    body: [
      parsed.data.instructions ?? "",
      parsed.data.dueDate
        ? `Consegna entro il ${new Date(`${parsed.data.dueDate}T00:00:00`).toLocaleDateString("it-IT")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    materialId: material.id,
    writtenExamId: exam.id,
  });

  res.status(201).json({ ...assignmentView(exam), submissionsCount: 0, toValidateCount: 0 });
});

/** Il docente ritira un compito assegnato (e le relative consegne). */
router.delete("/written-exams/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [exam] = await db.select().from(writtenExamsTable).where(eq(writtenExamsTable.id, id));
  if (!exam || !(await teacherCanManageMaterial(req.teacher!.id, exam.materialId))) {
    res.status(404).json({ error: "Compito non trovato" });
    return;
  }

  // Le diagnosi non hanno una chiave esterna verso le consegne (la sorgente e'
  // polimorfica): vanno tolte a mano prima che la cascata cancelli le consegne.
  const submissions = await db
    .select({ id: writtenExamSubmissionsTable.id })
    .from(writtenExamSubmissionsTable)
    .where(eq(writtenExamSubmissionsTable.examId, id));
  await deleteDiagnosisForSources("scritto", submissions.map((s) => s.id));
  await dropEvidenceForSources("scritto", submissions.map((s) => s.id));
  await db.delete(writtenExamsTable).where(eq(writtenExamsTable.id, id));
  res.status(204).end();
});

/**
 * Lo studente consegna il compito. L'assistente prepara una proposta di
 * valutazione che resta al docente: allo studente non arriva nessun voto
 * finche' non c'e' il visto.
 */
router.post("/written-exams/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  if (!Number.isInteger(examId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const parsed = SubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [exam] = await db.select().from(writtenExamsTable).where(eq(writtenExamsTable.id, examId));
  if (!exam) {
    res.status(404).json({ error: "Compito non trovato" });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, exam.materialId));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const student = await findApprovedStudentForMaterial(req.authUserId!, material.id);
  if (!student) {
    res.status(403).json({ error: "Non sei iscritto a una classe con accesso a questo materiale" });
    return;
  }

  if (exam.recoverySetId !== null && !(await recoveryRecipientIds(exam.recoverySetId)).includes(student.id)) {
    res.status(404).json({ error: "Compito non trovato" });
    return;
  }

  // Una consegna per studente: il compito non si rifà.
  const [existing] = await db
    .select({ id: writtenExamSubmissionsTable.id })
    .from(writtenExamSubmissionsTable)
    .where(
      and(
        eq(writtenExamSubmissionsTable.examId, examId),
        eq(writtenExamSubmissionsTable.authUserId, req.authUserId!),
      ),
    );
  if (existing) {
    res.status(409).json({ error: "Hai già consegnato questo compito." });
    return;
  }

  req.log.info({ examId }, "Grading written exam submission");

  const candidates = await candidateObjectivesForStudentWork({
    classId: student.classId,
    subject: material.subject,
    gradeLevel: material.gradeLevel,
    materialId: material.id,
    priorityObjectiveIds: exam.recoverySetId !== null ? await recoveryObjectiveIds(exam.recoverySetId) : undefined,
  });
  const { grade, feedback, diagnosis } = await gradeWrittenExam(
    exam.examType,
    exam.prompt,
    material.subject,
    parsed.data.studentAnswer,
    toCandidates(candidates),
  );

  const [created] = await db
    .insert(writtenExamSubmissionsTable)
    .values({
      examId,
      authUserId: req.authUserId!,
      studentName: student.name,
      classId: student.classId,
      answer: parsed.data.studentAnswer,
      aiGrade: typeof grade === "number" ? Math.round(grade) : null,
      aiFeedback: feedback ?? "",
    })
    .returning();

  // La diagnosi e' un di piu' rispetto al voto: se manca, la consegna vale lo stesso.
  try {
    const stored = await storeDiagnosis({
      sourceKind: "scritto",
      sourceId: created.id,
      authUserId: req.authUserId!,
      classId: student.classId,
      items: diagnosis,
      candidates,
    });
    if (!stored) req.log.warn({ submissionId: created.id }, "Nessuna diagnosi valida dal modello");
  } catch (err) {
    req.log.error({ err, submissionId: created.id }, "Diagnosi non salvata");
  }

  res.status(201).json({
    id: created.id,
    examId: created.examId,
    answer: created.answer,
    status: created.validationStatus,
    grade: null,
    feedback: null,
    createdAt: created.createdAt,
  });
});

export default router;
