import { Router, type IRouter } from "express";
import { eq, inArray, desc } from "drizzle-orm";
import { db, materialsTable, questionsTable, quizAttemptsTable, reviewItemsTable } from "@sillabo/db";
import type { GradedAnswerRecord } from "@sillabo/db";
import {
  ListQuizAttemptsParams,
  ListQuizAttemptsResponse,
  SubmitQuizAttemptParams,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptResponse,
} from "@sillabo/api-zod";
import { gradeQuizAnswer } from "../lib/ai";
import { requireAuth, findApprovedStudentForMaterial } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/materials/:id/quiz-attempts", requireAuth, async (req, res): Promise<void> => {
  const params = ListQuizAttemptsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(quizAttemptsTable)
    .where(eq(quizAttemptsTable.materialId, params.data.id))
    .orderBy(desc(quizAttemptsTable.createdAt));

  res.json(ListQuizAttemptsResponse.parse(rows));
});

router.post("/materials/:id/quiz-attempts", requireAuth, async (req, res): Promise<void> => {
  const params = SubmitQuizAttemptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitQuizAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, params.data.id));

  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const student = await findApprovedStudentForMaterial(req.authUserId!, material.id);
  if (!student) {
    res.status(403).json({ error: "Non sei iscritto a una classe con accesso a questo materiale" });
    return;
  }
  parsed.data.studentName = student.name;

  const questionIds = parsed.data.answers.map((a) => a.questionId);
  const questions = questionIds.length
    ? await db.select().from(questionsTable).where(inArray(questionsTable.id, questionIds))
    : [];
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  req.log.info({ materialId: material.id, count: parsed.data.answers.length }, "Grading quiz attempt");

  const gradedAnswers: GradedAnswerRecord[] = await Promise.all(
    parsed.data.answers.map(async (answer) => {
      const question = questionsById.get(answer.questionId);
      if (!question) {
        return {
          questionId: answer.questionId,
          question: "Domanda non trovata",
          topic: "",
          answerText: answer.answerText,
          correct: false,
          feedback: "Questa domanda non e' piu' disponibile.",
        };
      }

      const result = await gradeQuizAnswer(question.question, question.answer, answer.answerText);

      return {
        questionId: question.id,
        question: question.question,
        topic: question.topic,
        answerText: answer.answerText,
        correct: result.correct,
        feedback: result.feedback,
      };
    }),
  );

  const score = gradedAnswers.filter((a) => a.correct).length;

  const [attempt] = await db
    .insert(quizAttemptsTable)
    .values({
      materialId: material.id,
      studentName: parsed.data.studentName,
      score,
      total: gradedAnswers.length,
      gradedAnswers,
    })
    .returning();

  const missedTopics = Array.from(
    new Set(gradedAnswers.filter((a) => !a.correct && a.topic).map((a) => a.topic)),
  );

  if (missedTopics.length > 0) {
    const intervalsInDays = [1, 3, 7];
    const now = Date.now();
    await db.insert(reviewItemsTable).values(
      missedTopics.flatMap((topic) =>
        intervalsInDays.map((days) => ({
          materialId: material.id,
          studentName: parsed.data.studentName,
          topic,
          dueDate: new Date(now + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          status: "da_fare",
        })),
      ),
    );
  }

  res.status(201).json(SubmitQuizAttemptResponse.parse(attempt));
});

export default router;
