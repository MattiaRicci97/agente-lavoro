import { Router, type IRouter } from "express";
import { eq, sql, desc, inArray } from "drizzle-orm";
import {
  db,
  materialsTable,
  questionsTable,
  quizAttemptsTable,
  oralSessionsTable,
  materialClassesTable,
} from "@sillabo/db";
import type { GradedAnswerRecord } from "@sillabo/db";
import {
  GetMaterialAnalyticsParams,
  GetMaterialAnalyticsResponse,
  GetDashboardSummaryResponse,
} from "@sillabo/api-zod";
import { attachClassIds } from "../lib/materialClasses";
import { teacherCanManageMaterial, teacherMaterialIds } from "../lib/materialAccess";
import { requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/materials/:id/analytics", requireTeacher, async (req, res): Promise<void> => {
  const params = GetMaterialAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Le statistiche contengono nomi e voti degli studenti: le vede solo
  // il docente che ha caricato il materiale o che ha la classe collegata.
  if (!(await teacherCanManageMaterial(req.teacher!.id, params.data.id))) {
    res.status(404).json({ error: "Materiale non trovato" });
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

  res.json(
    GetMaterialAnalyticsResponse.parse({
      materialId: material.id,
      studentsCount: studentNames.size,
      quizAttemptsCount: quizAttempts.length,
      averageQuizScorePercent,
      oralSessionsCount: oralSessions.length,
      averageOralGrade,
      topicGaps,
      // Nessuna lista di "studenti a rischio": le difficolta' si leggono sugli obiettivi, non sulle persone.
      atRiskStudents: [],
    }),
  );
});

router.get("/dashboard-summary", requireTeacher, async (req, res): Promise<void> => {
  // La panoramica riguarda il lavoro di questo docente, non l'intera piattaforma.
  const myMaterialIds = await teacherMaterialIds(req.teacher!.id);
  if (!myMaterialIds.length) {
    res.json(
      GetDashboardSummaryResponse.parse({
        materialsCount: 0,
        totalQuestions: 0,
        totalQuizAttempts: 0,
        totalOralSessions: 0,
        averageQuizScorePercent: 0,
        recentMaterials: [],
      }),
    );
    return;
  }

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
    .where(inArray(materialsTable.id, myMaterialIds))
    .groupBy(materialsTable.id)
    .orderBy(desc(materialsTable.createdAt));

  const materials = await attachClassIds(materialRows);

  const [{ totalQuestions } = { totalQuestions: 0 }] = await db
    .select({ totalQuestions: sql<number>`count(*)::int` })
    .from(questionsTable)
    .where(inArray(questionsTable.materialId, myMaterialIds));

  const quizAttempts = await db
    .select()
    .from(quizAttemptsTable)
    .where(inArray(quizAttemptsTable.materialId, myMaterialIds));
  const [{ totalOralSessions } = { totalOralSessions: 0 }] = await db
    .select({ totalOralSessions: sql<number>`count(*)::int` })
    .from(oralSessionsTable)
    .where(inArray(oralSessionsTable.materialId, myMaterialIds));

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
