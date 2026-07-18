import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  studentsTable,
  classesTable,
  modulesTable,
  institutionModulesTable,
  moduleLessonsTable,
  moduleQuestionsTable,
  moduleLessonProgressTable,
} from "@sillabo/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * Verifica se un modulo e' attivo per l'istituto dello studente autenticato.
 * (Per i docenti il modulo e' sempre visibile in anteprima.)
 */
async function isModuleActiveForUser(req: Request, moduleKey: string): Promise<boolean> {
  const memberships = await db
    .select({ institutionId: classesTable.institutionId })
    .from(studentsTable)
    .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
    .where(eq(studentsTable.authUserId, req.authUserId!));

  if (!memberships.length) {
    // Non e' uno studente iscritto: docenti e utenti senza classe vedono l'anteprima.
    return true;
  }

  const institutionIds = Array.from(new Set(memberships.map((m) => m.institutionId)));
  const [row] = await db
    .select({ active: institutionModulesTable.active })
    .from(institutionModulesTable)
    .innerJoin(modulesTable, eq(modulesTable.id, institutionModulesTable.moduleId))
    .where(
      and(
        eq(modulesTable.key, moduleKey),
        eq(institutionModulesTable.active, true),
        inArray(institutionModulesTable.institutionId, institutionIds),
      ),
    );

  return !!row;
}

/** Lezioni di un modulo, con stato di avanzamento dello studente. */
router.get("/modules/:key/lessons", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const moduleKey = String(req.params.key);

  const active = await isModuleActiveForUser(req, moduleKey);
  const lessons = await db
    .select()
    .from(moduleLessonsTable)
    .where(eq(moduleLessonsTable.moduleKey, moduleKey))
    .orderBy(asc(moduleLessonsTable.ord));

  const progress = lessons.length
    ? await db
        .select()
        .from(moduleLessonProgressTable)
        .where(
          and(
            eq(moduleLessonProgressTable.authUserId, req.authUserId!),
            inArray(moduleLessonProgressTable.lessonId, lessons.map((l) => l.id)),
          ),
        )
    : [];
  const progressByLesson = new Map(progress.map((p) => [p.lessonId, p]));

  res.json({
    moduleKey,
    active,
    lessons: lessons.map((l) => ({
      id: l.id,
      ord: l.ord,
      title: l.title,
      minutes: l.minutes,
      completed: progressByLesson.has(l.id),
      quizScore: progressByLesson.get(l.id)?.quizScore ?? null,
      quizTotal: progressByLesson.get(l.id)?.quizTotal ?? null,
    })),
  });
});

/** Dettaglio lezione: contenuto + domande (senza risposta corretta). */
router.get("/module-lessons/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [lesson] = await db.select().from(moduleLessonsTable).where(eq(moduleLessonsTable.id, id));
  if (!lesson) {
    res.status(404).json({ error: "Lezione non trovata" });
    return;
  }

  const active = await isModuleActiveForUser(req, lesson.moduleKey);
  if (!active) {
    res.status(403).json({ error: "Questo modulo non e' attivo per il tuo istituto" });
    return;
  }

  const questions = await db
    .select({
      id: moduleQuestionsTable.id,
      question: moduleQuestionsTable.question,
      options: moduleQuestionsTable.options,
    })
    .from(moduleQuestionsTable)
    .where(eq(moduleQuestionsTable.lessonId, id));

  res.json({ ...lesson, questions });
});

const SubmitLessonQuizSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.number().int().positive(),
      selectedIndex: z.number().int().min(0).max(10),
    }),
  ),
});

/** Correzione quiz di fine lezione (lato server, nessun costo AI) + salvataggio avanzamento. */
router.post("/module-lessons/:id/submit", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = SubmitLessonQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lesson] = await db.select().from(moduleLessonsTable).where(eq(moduleLessonsTable.id, id));
  if (!lesson) {
    res.status(404).json({ error: "Lezione non trovata" });
    return;
  }

  const questions = await db
    .select()
    .from(moduleQuestionsTable)
    .where(eq(moduleQuestionsTable.lessonId, id));
  const byId = new Map(questions.map((q) => [q.id, q]));

  const graded = parsed.data.answers
    .filter((a) => byId.has(a.questionId))
    .map((a) => {
      const q = byId.get(a.questionId)!;
      return {
        questionId: q.id,
        correct: a.selectedIndex === q.correctIndex,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      };
    });

  const score = graded.filter((g) => g.correct).length;
  const total = questions.length;

  await db
    .insert(moduleLessonProgressTable)
    .values({ lessonId: id, authUserId: req.authUserId!, quizScore: score, quizTotal: total })
    .onConflictDoUpdate({
      target: [moduleLessonProgressTable.lessonId, moduleLessonProgressTable.authUserId],
      set: { quizScore: score, quizTotal: total, completedAt: new Date() },
    });

  res.json({ score, total, graded });
});

export default router;
