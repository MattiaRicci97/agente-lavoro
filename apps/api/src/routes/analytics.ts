import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  materialsTable,
  questionsTable,
  quizAttemptsTable,
  oralSessionsTable,
} from "@sillabo/db";
import type { GradedAnswerRecord } from "@sillabo/db";
import {
  GetMaterialAnalyticsParams,
  GetMaterialAnalyticsResponse,
  GetDashboardSummaryResponse,
} from "@sillabo/api-zod";
import { attachClassIds } from "../lib/materialClasses";
import { requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/materials/:id/analytics", requireTeacher, async (req, res): Promise<void> => {
  const params = GetMaterialAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  const quizAttempts = await db
    .select()
    .from(quizAttemptsTable)
    .where(eq(quizAttemptsTable.materialId, material.id));

  const oralSessions = await db
    .select()
    .from(oralSessionsTable)
    .where(eq(oralSessionsTable.materialId, material.id));

  const studentNames = new Set<string>([
    ...quizAttempts.map((a) => a.studentName),
    ...oralSessions.map((s) => s.studentName),
  ]);

  const averageQuizScorePercent = quizAttempts.length
    ? Math.round(
        (quizAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) /
          quizAttempts.length) *
          1000,
      ) / 10
    : 0;

  const completedOralSessions = oralSessions.filter((s) => s.status === "completata" && s.grade != null);
  const averageOralGrade = completedOralSessions.length
    ? Math.round(
        (completedOralSessions.reduce((sum, s) => sum + (s.grade ?? 0), 0) / completedOralSessions.length) * 10,
      ) / 10
    : null;

  const topicStats = new Map<string, { correct: number; total: number }>();
  for (const attempt of quizAttempts) {
    const gradedAnswers = attempt.gradedAnswers as GradedAnswerRecord[];
    for (const answer of gradedAnswers) {
      const stat = topicStats.get(answer.topic) ?? { correct: 0, total: 0 };
      stat.total += 1;
      if (answer.correct) stat.correct += 1;
      topicStats.set(answer.topic, stat);
    }
  }

  const topicGaps = Array.from(topicStats.entries())
    .filter(([topic]) => topic)
    .map(([topic, stat]) => ({
      topic,
      accuracyRate: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
      attemptsCount: stat.total,
    }))
    .sort((a, b) => a.accuracyRate - b.accuracyRate);

  const studentScores = new Map<string, { correct: number; total: number }>();
  for (const attempt of quizAttempts) {
    const stat = studentScores.get(attempt.studentName) ?? { correct: 0, total: 0 };
    stat.correct += attempt.score;
    stat.total += attempt.total;
    studentScores.set(attempt.studentName, stat);
  }

  const atRiskStudents = Array.from(studentScores.entries())
    .filter(([, stat]) => stat.total > 0 && stat.correct / stat.total < 0.5)
    .map(([name]) => name);

  res.json(
    GetMaterialAnalyticsResponse.parse({
      materialId: material.id,
      studentsCount: studentNames.size,
      quizAttemptsCount: quizAttempts.length,
      averageQuizScorePercent,
      oralSessionsCount: oralSessions.length,
      averageOralGrade,
      topicGaps,
      atRiskStudents,
    }),
  );
});

router.get("/dashboard-summary", requireTeacher, async (_req, res): Promise<void> => {
  const materialRows = await db
    .select({
      id: materialsTable.id,
      title: materialsTable.title,
      subject: materialsTable.subject,
      gradeLevel: materialsTable.gradeLevel,
      content: materialsTable.content,
      fileUrl: materialsTable.fileUrl,
      fileName: materialsTable.fileName,
      curriculumTopic: materialsTable.curriculumTopic,
      curriculumSubtopic: materialsTable.curriculumSubtopic,
      simplifiedContent: materialsTable.simplifiedContent,
      createdAt: materialsTable.createdAt,
      questionCount: sql<number>`count(distinct ${questionsTable.id})::int`,
    })
    .from(materialsTable)
    .leftJoin(questionsTable, eq(questionsTable.materialId, materialsTable.id))
    .groupBy(materialsTable.id)
    .orderBy(desc(materialsTable.createdAt));

  const materials = await attachClassIds(materialRows);

  const [{ totalQuestions } = { totalQuestions: 0 }] = await db
    .select({ totalQuestions: sql<number>`count(*)::int` })
    .from(questionsTable);

  const quizAttempts = await db.select().from(quizAttemptsTable);
  const [{ totalOralSessions } = { totalOralSessions: 0 }] = await db
    .select({ totalOralSessions: sql<number>`count(*)::int` })
    .from(oralSessionsTable);

  const averageQuizScorePercent = quizAttempts.length
    ? Math.round(
        (quizAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) /
          quizAttempts.length) *
          1000,
      ) / 10
    : 0;

  res.json(
    GetDashboardSummaryResponse.parse({
      materialsCount: materials.length,
      totalQuestions,
      totalQuizAttempts: quizAttempts.length,
      totalOralSessions,
      averageQuizScorePercent,
      recentMaterials: materials.slice(0, 5),
    }),
  );
});

export default router;
