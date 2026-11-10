import { Router, type IRouter } from "express";
import { eq, and, inArray, lte, gt, desc, asc, isNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  learningObjectivesTable,
  recoverySetsTable,
  recoveryQuestionsTable,
  recoveryItemsTable,
  studentNoticesTable,
  type RecoverySet,
} from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { teacherClassIds, isClassTeacher } from "../lib/classAccess";
import { recoverySetDetail, approveAndDistribute, RecoveryError, studentRowsFor } from "../lib/recovery";
import { recordEvidence, masteryForStudents } from "../lib/mastery";
import { generateRecoveryQuestions } from "../lib/ai";
import { ERROR_TYPE_FOR_PROMPT } from "../lib/recoveryPrompt";

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Il set, solo se il docente fa parte del consiglio della sua classe. */
async function setForTeacher(teacherId: number, setId: number): Promise<RecoverySet | null> {
  const [set] = await db.select().from(recoverySetsTable).where(eq(recoverySetsTable.id, setId));
  if (!set || !(await isClassTeacher(teacherId, set.classId))) return null;
  return set;
}

// ---------------------------------------------------------------------------
// Docente
// ---------------------------------------------------------------------------

/** I set di recupero delle classi del docente: prima le bozze in attesa. */
router.get("/recovery-sets", requireTeacher, async (req, res): Promise<void> => {
  const classIds = await teacherClassIds(req.teacher!.id);
  if (!classIds.length) {
    res.json({ sets: [] });
    return;
  }
  const sets = await db
    .select()
    .from(recoverySetsTable)
    .where(inArray(recoverySetsTable.classId, classIds))
    .orderBy(asc(recoverySetsTable.status), desc(recoverySetsTable.createdAt))
    .limit(60);
  const classes = await db
    .select({ id: classesTable.id, name: classesTable.name })
    .from(classesTable)
    .where(inArray(classesTable.id, classIds));
  const className = new Map(classes.map((c) => [c.id, c.name]));

  const out = [];
  for (const set of sets) {
    const detail = await recoverySetDetail(set);
    // Una bozza senza piu' lacune (diagnosi ritirate) non ha nulla da proporre.
    if (set.status === "bozza" && !detail.objectives.length) continue;
    out.push({ ...detail, className: className.get(set.classId) ?? "" });
  }
  res.json({ sets: out });
});

/** L'assistente propone le domande per gli obiettivi che non ne hanno ancora. */
router.post("/recovery-sets/:id/generate", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const set = id ? await setForTeacher(req.teacher!.id, id) : null;
  if (!set) {
    res.status(404).json({ error: "Recupero non trovato" });
    return;
  }
  if (set.status !== "bozza") {
    res.status(409).json({ error: "Questo recupero e' gia' stato approvato" });
    return;
  }
  const detail = await recoverySetDetail(set);
  const missing = detail.objectives.filter((o) => !o.questions.length);
  if (!missing.length) {
    res.json(detail);
    return;
  }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, set.classId));
  const [first] = await db
    .select({ subject: learningObjectivesTable.subject })
    .from(learningObjectivesTable)
    .where(eq(learningObjectivesTable.id, missing[0].id));

  try {
    const drafts = await generateRecoveryQuestions({
      subject: first?.subject ?? "",
      gradeLevel: cls?.gradeLevel ?? "",
      perObjective: Math.max(2, Math.min(3, set.intervalsDays.length)),
      objectives: missing.map((o) => {
        const top = Object.entries(o.errorTypes).sort((a, b) => b[1] - a[1])[0]?.[0];
        return { code: o.code, title: o.title, description: o.description, commonError: top ? (ERROR_TYPE_FOR_PROMPT[top] ?? null) : null };
      }),
    });
    const idByCode = new Map(missing.map((o) => [o.code, o.id]));
    if (drafts.length) {
      await db.insert(recoveryQuestionsTable).values(
        drafts.map((d) => ({
          recoverySetId: set.id,
          objectiveId: idByCode.get(d.objectiveCode)!,
          question: d.question,
          answer: d.answer,
          authorType: "ai",
        })),
      );
    }
    res.json(await recoverySetDetail(set));
  } catch (err) {
    req.log.error({ err }, "Generazione domande di recupero fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a preparare le domande. Riprova, o scrivile tu." });
  }
});

const QuestionBody = z.object({
  objectiveId: z.number().int().positive(),
  question: z.string().trim().min(5).max(600),
  answer: z.string().trim().min(1).max(1200),
});

/** Il docente aggiunge una domanda sua. */
router.post("/recovery-sets/:id/questions", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const set = id ? await setForTeacher(req.teacher!.id, id) : null;
  if (!set) {
    res.status(404).json({ error: "Recupero non trovato" });
    return;
  }
  if (set.status !== "bozza") {
    res.status(409).json({ error: "Questo recupero e' gia' stato approvato" });
    return;
  }
  const parsed = QuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const detail = await recoverySetDetail(set);
  if (!detail.objectives.some((o) => o.id === parsed.data.objectiveId)) {
    res.status(400).json({ error: "Questo obiettivo non fa parte del recupero" });
    return;
  }
  await db.insert(recoveryQuestionsTable).values({ recoverySetId: set.id, ...parsed.data, authorType: "docente" });
  res.status(201).json(await recoverySetDetail(set));
});

/** La domanda e il suo set, solo se in bozza e del docente. */
async function editableQuestion(teacherId: number, questionId: number) {
  const [q] = await db.select().from(recoveryQuestionsTable).where(eq(recoveryQuestionsTable.id, questionId));
  if (!q) return null;
  const set = await setForTeacher(teacherId, q.recoverySetId);
  return set ? { q, set } : null;
}

router.patch("/recovery-questions/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const found = id ? await editableQuestion(req.teacher!.id, id) : null;
  if (!found) {
    res.status(404).json({ error: "Domanda non trovata" });
    return;
  }
  if (found.set.status !== "bozza") {
    res.status(409).json({ error: "Questo recupero e' gia' stato approvato" });
    return;
  }
  const parsed = QuestionBody.omit({ objectiveId: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .update(recoveryQuestionsTable)
    .set({ ...parsed.data, authorType: "docente" })
    .where(eq(recoveryQuestionsTable.id, id!));
  res.json(await recoverySetDetail(found.set));
});

router.delete("/recovery-questions/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const found = id ? await editableQuestion(req.teacher!.id, id) : null;
  if (!found) {
    res.status(404).json({ error: "Domanda non trovata" });
    return;
  }
  if (found.set.status !== "bozza") {
    res.status(409).json({ error: "Questo recupero e' gia' stato approvato" });
    return;
  }
  await db.delete(recoveryQuestionsTable).where(eq(recoveryQuestionsTable.id, id!));
  res.json(await recoverySetDetail(found.set));
});

const ApproveBody = z.object({
  /** Giorni dall'approvazione, crescenti. */
  intervalsDays: z
    .array(z.number().int().min(1).max(120))
    .min(1)
    .max(5)
    .refine((a) => a.every((v, i) => i === 0 || v > a[i - 1]), "Gli intervalli devono essere crescenti")
    .optional(),
});

/** L'unica porta da cui parte un recupero. */
router.post("/recovery-sets/:id/approve", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const set = id ? await setForTeacher(req.teacher!.id, id) : null;
  if (!set) {
    res.status(404).json({ error: "Recupero non trovato" });
    return;
  }
  const parsed = ApproveBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await approveAndDistribute(
      { ...set, intervalsDays: parsed.data.intervalsDays ?? set.intervalsDays },
      req.teacher!.id,
    );
    const [fresh] = await db.select().from(recoverySetsTable).where(eq(recoverySetsTable.id, set.id));
    res.json({ ...(await recoverySetDetail(fresh)), distributed: result });
  } catch (err) {
    if (err instanceof RecoveryError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/** Il docente decide che questo recupero non serve (solo finche' e' una bozza). */
router.delete("/recovery-sets/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const set = id ? await setForTeacher(req.teacher!.id, id) : null;
  if (!set) {
    res.status(404).json({ error: "Recupero non trovato" });
    return;
  }
  if (set.status !== "bozza") {
    res.status(409).json({ error: "Un recupero gia' distribuito non si elimina" });
    return;
  }
  await db.delete(recoverySetsTable).where(eq(recoverySetsTable.id, set.id));
  res.status(204).end();
});

/** Il profilo di padronanza di uno studente, per i docenti della sua classe. */
router.get("/students/:id/mastery", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [student] = id ? await db.select().from(studentsTable).where(eq(studentsTable.id, id)) : [];
  if (!student || !(await isClassTeacher(req.teacher!.id, student.classId))) {
    res.status(404).json({ error: "Studente non trovato" });
    return;
  }
  res.json({ mastery: (await masteryForStudents([student.id])).get(student.id) ?? [] });
});

// ---------------------------------------------------------------------------
// Studente
// ---------------------------------------------------------------------------

/** I richiami di oggi (e arretrati), con la domanda; piu' il prossimo in arrivo. */
router.get("/me/recovery", requireAuth, async (req, res): Promise<void> => {
  const students = await studentRowsFor(req.authUserId!);
  if (!students.length) {
    res.json({ due: [], nextDueDate: null });
    return;
  }
  const studentIds = students.map((s) => s.id);
  const today = new Date().toISOString().slice(0, 10);
  const due = await db
    .select({
      id: recoveryItemsTable.id,
      round: recoveryItemsTable.round,
      dueDate: recoveryItemsTable.dueDate,
      objectiveId: learningObjectivesTable.id,
      objectiveTitle: learningObjectivesTable.title,
      question: recoveryQuestionsTable.question,
      answer: recoveryQuestionsTable.answer,
    })
    .from(recoveryItemsTable)
    .innerJoin(learningObjectivesTable, eq(learningObjectivesTable.id, recoveryItemsTable.objectiveId))
    .innerJoin(recoveryQuestionsTable, eq(recoveryQuestionsTable.id, recoveryItemsTable.questionId))
    .where(
      and(
        inArray(recoveryItemsTable.studentId, studentIds),
        eq(recoveryItemsTable.status, "da_fare"),
        lte(recoveryItemsTable.dueDate, today),
      ),
    )
    .orderBy(asc(recoveryItemsTable.dueDate), asc(recoveryItemsTable.id))
    .limit(12);
  const [next] = await db
    .select({ dueDate: sql<string | null>`min(${recoveryItemsTable.dueDate})` })
    .from(recoveryItemsTable)
    .where(
      and(
        inArray(recoveryItemsTable.studentId, studentIds),
        eq(recoveryItemsTable.status, "da_fare"),
        gt(recoveryItemsTable.dueDate, today),
      ),
    );
  res.json({ due, nextDueDate: next?.dueDate ?? null });
});

const CompleteBody = z.object({ knewIt: z.boolean() });

/**
 * Lo studente chiude un richiamo dicendo com'e' andata. E' pratica: aggiorna
 * il profilo come autovalutazione e non crea nessun voto.
 */
router.post("/recovery-items/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = CompleteBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: "Richiesta non valida" });
    return;
  }
  const studentIds = (await studentRowsFor(req.authUserId!)).map((s) => s.id);
  const today = new Date().toISOString().slice(0, 10);
  const [item] = studentIds.length
    ? await db
        .select()
        .from(recoveryItemsTable)
        .where(and(eq(recoveryItemsTable.id, id), inArray(recoveryItemsTable.studentId, studentIds)))
    : [];
  if (!item || item.dueDate > today) {
    res.status(404).json({ error: "Richiamo non trovato" });
    return;
  }
  const result = parsed.data.knewIt ? "corretto" : "errato";
  const [updated] = await db
    .update(recoveryItemsTable)
    .set({ status: "fatto", result, completedAt: new Date() })
    .where(and(eq(recoveryItemsTable.id, id), eq(recoveryItemsTable.status, "da_fare")))
    .returning({ id: recoveryItemsTable.id });
  if (updated) {
    await recordEvidence([
      {
        studentId: item.studentId,
        objectiveId: item.objectiveId,
        source: "autovalutazione",
        outcome: result,
        sourceKind: "recupero",
        sourceId: item.id,
      },
    ]);
  }
  res.json({ id, status: "fatto", result });
});

/** Il proprio profilo: obiettivi verificati e in esercizio. */
router.get("/me/mastery", requireAuth, async (req, res): Promise<void> => {
  const studentIds = (await studentRowsFor(req.authUserId!)).map((s) => s.id);
  const all = await masteryForStudents(studentIds);
  res.json({ mastery: studentIds.flatMap((id) => all.get(id) ?? []) });
});

/** Avvisi personali non ancora letti. */
router.get("/me/notices", requireAuth, async (req, res): Promise<void> => {
  const studentIds = (await studentRowsFor(req.authUserId!)).map((s) => s.id);
  if (!studentIds.length) {
    res.json({ notices: [] });
    return;
  }
  const notices = await db
    .select({
      id: studentNoticesTable.id,
      kind: studentNoticesTable.kind,
      title: studentNoticesTable.title,
      body: studentNoticesTable.body,
      link: studentNoticesTable.link,
      createdAt: studentNoticesTable.createdAt,
    })
    .from(studentNoticesTable)
    .where(and(inArray(studentNoticesTable.studentId, studentIds), isNull(studentNoticesTable.readAt)))
    .orderBy(desc(studentNoticesTable.createdAt))
    .limit(10);
  res.json({ notices });
});

router.post("/me/notices/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const studentIds = (await studentRowsFor(req.authUserId!)).map((s) => s.id);
  if (!id || !studentIds.length) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }
  const [updated] = await db
    .update(studentNoticesTable)
    .set({ readAt: new Date() })
    .where(and(eq(studentNoticesTable.id, id), inArray(studentNoticesTable.studentId, studentIds)))
    .returning({ id: studentNoticesTable.id });
  if (!updated) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }
  res.status(204).end();
});

export default router;
