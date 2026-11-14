import { Router, type IRouter, type Request } from "express";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  materialsTable,
  materialClassesTable,
  studyPlansTable,
  type StudyPlanContent,
} from "@sillabo/db";
import { requireAuth } from "../middlewares/auth";
import { searchCourse, courseMaterials, sourceLabel, type Passage } from "../lib/courseSearch";
import { askCourseAssistant, generateReviewPlan } from "../lib/ai";
import { masteryForStudents } from "../lib/mastery";

const router: IRouter = Router();

/**
 * La chat di ripasso sul corso: lo studente chiede, l'assistente cerca in
 * tutto il materiale che il docente ha condiviso con la classe per quella
 * materia (documenti e lezioni) e risponde citando le fonti. Da li' puo'
 * nascere un piano di ripasso o un'interrogazione simulata sull'argomento.
 */

const CourseRef = z.object({
  classId: z.number().int().positive(),
  subject: z.string().trim().min(1).max(100),
});

/** La riga dello studente in quella classe, o null: e' il controllo di accesso al corso. */
async function enrolled(req: Request, classId: number) {
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.authUserId, req.authUserId!), eq(studentsTable.classId, classId)));
  return student ?? null;
}

const toSources = (passages: Passage[]) =>
  Array.from(new Map(passages.map((p) => [p.materialId, { materialId: p.materialId, label: sourceLabel(p), kind: p.kind }])).values());

/** I corsi dello studente: una materia per classe, con quanti documenti e lezioni contiene. */
router.get("/courses/mine", requireAuth, async (req, res): Promise<void> => {
  const memberships = await db
    .select({ classId: studentsTable.classId, className: classesTable.name })
    .from(studentsTable)
    .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
    .where(eq(studentsTable.authUserId, req.authUserId!));
  if (!memberships.length) {
    res.json({ courses: [] });
    return;
  }
  const rows = await db
    .select({
      classId: materialClassesTable.classId,
      subject: sql<string>`min(${materialsTable.subject})`,
      documents: sql<number>`count(*) filter (where ${materialsTable.kind} <> 'lezione')::int`,
      lessons: sql<number>`count(*) filter (where ${materialsTable.kind} = 'lezione')::int`,
    })
    .from(materialsTable)
    .innerJoin(materialClassesTable, eq(materialClassesTable.materialId, materialsTable.id))
    .where(inArray(materialClassesTable.classId, memberships.map((m) => m.classId)))
    .groupBy(materialClassesTable.classId, sql`lower(${materialsTable.subject})`)
    .orderBy(sql`min(${materialsTable.subject})`);
  const className = new Map(memberships.map((m) => [m.classId, m.className]));
  res.json({ courses: rows.map((r) => ({ ...r, className: className.get(r.classId) ?? "" })) });
});

const ChatBody = CourseRef.extend({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(12)
    .default([]),
});

router.post("/courses/chat", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { classId, subject, question, history } = parsed.data;
  const student = await enrolled(req, classId);
  if (!student) {
    res.status(404).json({ error: "Corso non trovato" });
    return;
  }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!(await courseMaterials(classId, subject)).length) {
    res.status(404).json({ error: "Il docente non ha ancora condiviso materiale per questa materia" });
    return;
  }

  const found: Passage[] = [];
  const search = async (query: string) => {
    const passages = await searchCourse({ classId, subject, query, limit: 6 });
    for (const p of passages) if (!found.some((f) => f.content === p.content)) found.push(p);
    return passages.map((p) => ({ source: sourceLabel(p), content: p.content }));
  };

  try {
    const initial = await search(question);
    const { answer, usedPassages } = await askCourseAssistant({
      subject,
      gradeLevel: cls?.gradeLevel ?? "",
      besDsa: student.besDsa || req.authUser!.besDsa,
      history,
      question,
      initialPassages: initial,
      search,
    });
    // Le fonti mostrate sono quelle dei passaggi dati al modello, nell'ordine della numerazione.
    const ordered = usedPassages
      .map((u) => found.find((f) => f.content === u.content))
      .filter((p): p is Passage => !!p);
    res.json({ answer, sources: toSources(ordered), passages: ordered.map((p, i) => ({ n: i + 1, label: sourceLabel(p), materialId: p.materialId })) });
  } catch (err) {
    req.log.error({ err }, "Chat del corso fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a rispondere. Riprova tra poco." });
  }
});

const TopicBody = CourseRef.extend({ topic: z.string().trim().min(2).max(200) });

/** Prepara e salva un piano di ripasso sull'argomento, costruito sul materiale del corso. */
router.post("/courses/review-plan", requireAuth, async (req, res): Promise<void> => {
  const parsed = TopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { classId, subject, topic } = parsed.data;
  const student = await enrolled(req, classId);
  if (!student) {
    res.status(404).json({ error: "Corso non trovato" });
    return;
  }
  const passages = await searchCourse({ classId, subject, query: topic, limit: 8 });
  if (!passages.length) {
    res.status(404).json({ error: "Non ho trovato questo argomento nel materiale del corso. Prova con altre parole, o chiedi al docente." });
    return;
  }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  // Del profilo dello studente passano solo i titoli degli obiettivi ancora aperti in questa materia.
  const mastery = (await masteryForStudents([student.id])).get(student.id) ?? [];
  const open = mastery
    .filter((m) => m.objective.subject.toLowerCase() === subject.toLowerCase() && (m.state === "fragile" || m.state === "mancante"))
    .map((m) => m.objective.title);

  try {
    const draft = await generateReviewPlan({
      subject,
      gradeLevel: cls?.gradeLevel ?? "",
      topic,
      besDsa: student.besDsa || req.authUser!.besDsa,
      passages: passages.map((p) => ({ source: sourceLabel(p), content: p.content })),
      objectivesToConsolidate: open,
    });
    const plan: StudyPlanContent = {
      title: draft.title,
      summary: draft.summary,
      steps: draft.steps.map((s) => ({
        title: s.title,
        activity: s.activity,
        minutes: s.minutes,
        sources: Array.from(
          new Map(
            s.sources
              .map((n) => passages[n - 1])
              .filter((p): p is Passage => !!p)
              .map((p) => [p.materialId, { materialId: p.materialId, title: sourceLabel(p) }]),
          ).values(),
        ),
      })),
    };
    const [saved] = await db.insert(studyPlansTable).values({ studentId: student.id, classId, subject, topic, plan }).returning();
    res.status(201).json({ id: saved.id, topic, subject, plan, createdAt: saved.createdAt });
  } catch (err) {
    req.log.error({ err }, "Piano di ripasso fallito");
    res.status(502).json({ error: "L'assistente non e' riuscito a preparare il piano. Riprova tra poco." });
  }
});

/** I piani di ripasso gia' preparati per lo studente. */
router.get("/courses/review-plans", requireAuth, async (req, res): Promise<void> => {
  const students = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.authUserId, req.authUserId!));
  if (!students.length) {
    res.json({ plans: [] });
    return;
  }
  const plans = await db
    .select()
    .from(studyPlansTable)
    .where(inArray(studyPlansTable.studentId, students.map((s) => s.id)))
    .orderBy(desc(studyPlansTable.createdAt))
    .limit(10);
  res.json({ plans: plans.map((p) => ({ id: p.id, classId: p.classId, subject: p.subject, topic: p.topic, plan: p.plan, createdAt: p.createdAt })) });
});

/**
 * Da dove far partire l'interrogazione simulata su un argomento: il materiale
 * del corso che ne parla di piu'. L'interrogazione vera e propria usa poi i
 * passaggi di tutto il corso.
 */
router.post("/courses/oral-target", requireAuth, async (req, res): Promise<void> => {
  const parsed = TopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { classId, subject, topic } = parsed.data;
  if (!(await enrolled(req, classId))) {
    res.status(404).json({ error: "Corso non trovato" });
    return;
  }
  const passages = await searchCourse({ classId, subject, query: topic, limit: 8 });
  if (!passages.length) {
    res.status(404).json({ error: "Non ho trovato questo argomento nel materiale del corso. Prova con altre parole." });
    return;
  }
  const counts = new Map<number, number>();
  for (const p of passages) counts.set(p.materialId, (counts.get(p.materialId) ?? 0) + 1);
  const [materialId] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  res.json({ materialId, topic });
});

export default router;
