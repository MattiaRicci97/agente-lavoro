import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  studentsTable,
  invalsiTestsTable,
  invalsiItemsTable,
  invalsiAttemptsTable,
  type InvalsiTest,
  type InvalsiItem,
} from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { classForTeacher } from "../lib/classAccess";
import { announceToClasses } from "../lib/classFeed";
import { generateInvalsiTest } from "../lib/ai";
import {
  INVALSI_SUBJECTS,
  INVALSI_GRADES,
  ItemSchema,
  MIN_ITEMS_TO_PUBLISH,
  MAX_ITEMS,
  parseGeneratedTest,
  scoreAttempt,
  cleanAnswers,
  itemStats,
} from "../lib/invalsi";

const router: IRouter = Router();

/**
 * Prove di allenamento in stile INVALSI. L'assistente propone i quesiti, il
 * docente li rilegge e pubblica; la correzione e' automatica e il punteggio
 * non e' un voto.
 */

const parseId = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const itemsOf = (testId: number) =>
  db.select().from(invalsiItemsTable).where(eq(invalsiItemsTable.testId, testId)).orderBy(asc(invalsiItemsTable.ord), asc(invalsiItemsTable.id));

/** La prova, solo per un docente della classe. */
async function testForTeacher(teacherId: number, id: number | null): Promise<InvalsiTest | null> {
  if (!id) return null;
  const [test] = await db.select().from(invalsiTestsTable).where(eq(invalsiTestsTable.id, id));
  if (!test || !(await classForTeacher(teacherId, test.classId))) return null;
  return test;
}

const teacherItem = (i: InvalsiItem) => ({
  id: i.id,
  question: i.question,
  options: i.options,
  correctIndex: i.correctIndex,
  explanation: i.explanation,
  area: i.area,
  authorType: i.authorType,
});

/** Tutto quello che il docente vede di una prova: quesiti e, se pubblicata, risultati. */
async function teacherDetail(test: InvalsiTest) {
  const items = await itemsOf(test.id);
  const base = {
    id: test.id,
    classId: test.classId,
    subject: test.subject,
    gradeLevel: test.gradeLevel,
    title: test.title,
    passage: test.passage,
    minutes: test.minutes,
    status: test.status as "bozza" | "pubblicata",
    items: items.map(teacherItem),
  };
  if (test.status !== "pubblicata") return { ...base, results: null };

  const attempts = await db
    .select({
      answers: invalsiAttemptsTable.answers,
      score: invalsiAttemptsTable.score,
      total: invalsiAttemptsTable.total,
      studentName: studentsTable.name,
    })
    .from(invalsiAttemptsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, invalsiAttemptsTable.studentId))
    .where(eq(invalsiAttemptsTable.testId, test.id))
    .orderBy(asc(studentsTable.name));
  const [{ classSize }] = await db
    .select({ classSize: sql<number>`count(*)::int` })
    .from(studentsTable)
    .where(eq(studentsTable.classId, test.classId));
  return {
    ...base,
    results: {
      classSize,
      completed: attempts.length,
      averagePercent: attempts.length
        ? Math.round((attempts.reduce((sum, a) => sum + (a.total ? a.score / a.total : 0), 0) / attempts.length) * 100)
        : null,
      items: itemStats(items, attempts),
      students: attempts.map((a) => ({ name: a.studentName, score: a.score, total: a.total })),
    },
  };
}

// ---------------------------------------------------------------------------
// Docente
// ---------------------------------------------------------------------------

router.get("/classes/:id/invalsi-tests", requireTeacher, async (req, res): Promise<void> => {
  const classId = parseId(req.params.id);
  const cls = classId ? await classForTeacher(req.teacher!.id, classId) : null;
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const tests = await db.select().from(invalsiTestsTable).where(eq(invalsiTestsTable.classId, cls.id)).orderBy(desc(invalsiTestsTable.createdAt));
  res.json({ classGradeLevel: cls.gradeLevel, tests: await Promise.all(tests.map(teacherDetail)) });
});

const CreateBody = z.object({
  subject: z.enum(INVALSI_SUBJECTS),
  gradeLevel: z.enum(INVALSI_GRADES),
  count: z.number().int().min(5).max(20).default(10),
  focus: z.string().trim().max(200).optional(),
});

/** L'assistente propone una prova: nasce in bozza, invisibile agli studenti. */
router.post("/classes/:id/invalsi-tests", requireTeacher, async (req, res): Promise<void> => {
  const classId = parseId(req.params.id);
  const cls = classId ? await classForTeacher(req.teacher!.id, classId) : null;
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { subject, gradeLevel, count, focus } = parsed.data;
  try {
    const draft = parseGeneratedTest(await generateInvalsiTest({ subject, gradeLevel, count, focus: focus || null }));
    if (!draft.items.length) throw new Error("Nessun quesito valido nella proposta");
    const [test] = await db
      .insert(invalsiTestsTable)
      .values({
        classId: cls.id,
        teacherId: req.teacher!.id,
        subject,
        gradeLevel,
        title: draft.title,
        passage: subject === "Matematica" ? null : draft.passage,
        // Circa due minuti a quesito, piu' il tempo di lettura del testo.
        minutes: Math.max(10, draft.items.length * 2 + (draft.passage ? 10 : 0)),
      })
      .returning();
    await db.insert(invalsiItemsTable).values(draft.items.map((item, ord) => ({ testId: test.id, ord, ...item, authorType: "ai" })));
    res.status(201).json(await teacherDetail(test));
  } catch (err) {
    req.log.error({ err }, "Generazione prova INVALSI fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a preparare la prova. Riprova tra poco." });
  }
});

const TestPatch = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  passage: z.string().trim().max(8000).nullable().optional(),
  minutes: z.number().int().min(5).max(180).optional(),
});

/** La prova in bozza del docente, o la risposta d'errore gia' inviata. */
async function draftTest(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1], id: number | null) {
  const test = await testForTeacher(req.teacher!.id, id);
  if (!test) {
    res.status(404).json({ error: "Prova non trovata" });
    return null;
  }
  if (test.status !== "bozza") {
    res.status(409).json({ error: "La prova e' gia' pubblicata: non si puo' piu' modificare. Puoi ritirarla e prepararne un'altra." });
    return null;
  }
  return test;
}

router.patch("/invalsi-tests/:id", requireTeacher, async (req, res): Promise<void> => {
  const test = await draftTest(req, res, parseId(req.params.id));
  if (!test) return;
  const parsed = TestPatch.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(invalsiTestsTable)
    .set({ ...parsed.data, ...(parsed.data.passage !== undefined ? { passage: parsed.data.passage || null } : {}) })
    .where(eq(invalsiTestsTable.id, test.id))
    .returning();
  res.json(await teacherDetail(updated));
});

router.post("/invalsi-tests/:id/items", requireTeacher, async (req, res): Promise<void> => {
  const test = await draftTest(req, res, parseId(req.params.id));
  if (!test) return;
  const parsed = ItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ogni quesito ha una domanda, quattro alternative e una risposta corretta." });
    return;
  }
  const existing = await itemsOf(test.id);
  if (existing.length >= MAX_ITEMS) {
    res.status(400).json({ error: `Una prova puo' avere al massimo ${MAX_ITEMS} quesiti.` });
    return;
  }
  await db.insert(invalsiItemsTable).values({ testId: test.id, ord: existing.length, ...parsed.data, authorType: "docente" });
  res.status(201).json(await teacherDetail(test));
});

router.patch("/invalsi-items/:id", requireTeacher, async (req, res): Promise<void> => {
  const itemId = parseId(req.params.id);
  const [item] = itemId ? await db.select().from(invalsiItemsTable).where(eq(invalsiItemsTable.id, itemId)) : [];
  const test = await draftTest(req, res, item?.testId ?? null);
  if (!test) return;
  const parsed = ItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ogni quesito ha una domanda, quattro alternative e una risposta corretta." });
    return;
  }
  await db.update(invalsiItemsTable).set({ ...parsed.data, authorType: "docente" }).where(eq(invalsiItemsTable.id, item.id));
  res.json(await teacherDetail(test));
});

router.delete("/invalsi-items/:id", requireTeacher, async (req, res): Promise<void> => {
  const itemId = parseId(req.params.id);
  const [item] = itemId ? await db.select().from(invalsiItemsTable).where(eq(invalsiItemsTable.id, itemId)) : [];
  const test = await draftTest(req, res, item?.testId ?? null);
  if (!test) return;
  await db.delete(invalsiItemsTable).where(eq(invalsiItemsTable.id, item.id));
  res.json(await teacherDetail(test));
});

/** L'unica porta da cui la prova arriva agli studenti. */
router.post("/invalsi-tests/:id/publish", requireTeacher, async (req, res): Promise<void> => {
  const test = await draftTest(req, res, parseId(req.params.id));
  if (!test) return;
  const items = await itemsOf(test.id);
  if (items.length < MIN_ITEMS_TO_PUBLISH) {
    res.status(400).json({ error: `Servono almeno ${MIN_ITEMS_TO_PUBLISH} quesiti per pubblicare la prova.` });
    return;
  }
  const [updated] = await db
    .update(invalsiTestsTable)
    .set({ status: "pubblicata", publishedAt: new Date() })
    .where(eq(invalsiTestsTable.id, test.id))
    .returning();
  await announceToClasses({
    classIds: [test.classId],
    teacherId: req.teacher!.id,
    authorName: req.teacher!.name,
    kind: "verifica",
    title: `Allenamento INVALSI: ${test.title}`,
    body: `${items.length} quesiti di ${test.subject}, circa ${test.minutes} minuti. È un allenamento: non c'è voto. Lo trovi nella tua home.`,
  });
  res.json(await teacherDetail(updated));
});

router.delete("/invalsi-tests/:id", requireTeacher, async (req, res): Promise<void> => {
  const test = await testForTeacher(req.teacher!.id, parseId(req.params.id));
  if (!test) {
    res.status(404).json({ error: "Prova non trovata" });
    return;
  }
  await db.delete(invalsiTestsTable).where(eq(invalsiTestsTable.id, test.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Studente
// ---------------------------------------------------------------------------

/** La prova pubblicata e la riga dello studente nella sua classe, o null. */
async function testForStudent(authUserId: string, id: number | null) {
  if (!id) return null;
  const [test] = await db.select().from(invalsiTestsTable).where(and(eq(invalsiTestsTable.id, id), eq(invalsiTestsTable.status, "pubblicata")));
  if (!test) return null;
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.authUserId, authUserId), eq(studentsTable.classId, test.classId)));
  return student ? { test, student } : null;
}

router.get("/me/invalsi-tests", requireAuth, async (req, res): Promise<void> => {
  const students = await db.select().from(studentsTable).where(eq(studentsTable.authUserId, req.authUserId!));
  if (!students.length) {
    res.json({ tests: [] });
    return;
  }
  const tests = await db
    .select()
    .from(invalsiTestsTable)
    .where(and(inArray(invalsiTestsTable.classId, students.map((s) => s.classId)), eq(invalsiTestsTable.status, "pubblicata")))
    .orderBy(desc(invalsiTestsTable.publishedAt))
    .limit(30);
  const attempts = tests.length
    ? await db
        .select()
        .from(invalsiAttemptsTable)
        .where(and(inArray(invalsiAttemptsTable.testId, tests.map((t) => t.id)), inArray(invalsiAttemptsTable.studentId, students.map((s) => s.id))))
    : [];
  const byTest = new Map(attempts.map((a) => [a.testId, a]));
  res.json({
    tests: tests.map((t) => {
      const a = byTest.get(t.id);
      return { id: t.id, subject: t.subject, title: t.title, minutes: t.minutes, done: !!a, score: a?.score ?? null, total: a?.total ?? null };
    }),
  });
});

/** Cio' che lo studente vede dopo la consegna: le sue risposte, quelle giuste e le spiegazioni. */
function resultView(test: InvalsiTest, items: InvalsiItem[], answers: Record<string, number | null>, score: number, total: number) {
  return {
    id: test.id,
    subject: test.subject,
    title: test.title,
    passage: test.passage,
    minutes: test.minutes,
    done: true as const,
    score,
    total,
    items: items.map((i) => ({
      id: i.id,
      question: i.question,
      options: i.options,
      area: i.area,
      chosen: answers[String(i.id)] ?? null,
      correctIndex: i.correctIndex,
      explanation: i.explanation,
    })),
  };
}

/** La prova da svolgere. Prima della consegna le risposte giuste non lasciano il server. */
router.get("/invalsi-tests/:id/take", requireAuth, async (req, res): Promise<void> => {
  const found = await testForStudent(req.authUserId!, parseId(req.params.id));
  if (!found) {
    res.status(404).json({ error: "Prova non trovata" });
    return;
  }
  const { test, student } = found;
  const items = await itemsOf(test.id);
  const [attempt] = await db
    .select()
    .from(invalsiAttemptsTable)
    .where(and(eq(invalsiAttemptsTable.testId, test.id), eq(invalsiAttemptsTable.studentId, student.id)));
  if (attempt) {
    res.json(resultView(test, items, attempt.answers, attempt.score, attempt.total));
    return;
  }
  res.json({
    id: test.id,
    subject: test.subject,
    title: test.title,
    passage: test.passage,
    minutes: test.minutes,
    done: false,
    items: items.map((i) => ({ id: i.id, question: i.question, options: i.options, area: i.area })),
  });
});

const SubmitBody = z.object({ answers: z.record(z.string(), z.unknown()) });

/** Consegna: una sola volta, corretta subito. Non crea voti e non tocca il registro. */
router.post("/invalsi-tests/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const found = await testForStudent(req.authUserId!, parseId(req.params.id));
  if (!found) {
    res.status(404).json({ error: "Prova non trovata" });
    return;
  }
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { test, student } = found;
  const items = await itemsOf(test.id);
  const answers = cleanAnswers(items, parsed.data.answers);
  const { score, total } = scoreAttempt(items, answers);
  const inserted = await db
    .insert(invalsiAttemptsTable)
    .values({ testId: test.id, studentId: student.id, answers, score, total })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) {
    res.status(409).json({ error: "Hai gia' consegnato questa prova." });
    return;
  }
  res.status(201).json(resultView(test, items, answers, score, total));
});

export default router;
