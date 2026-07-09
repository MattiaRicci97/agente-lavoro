import { Router, type IRouter } from "express";
import { eq, inArray, and } from "drizzle-orm";
import {
  db,
  institutionsTable,
  classesTable,
  studentsTable,
  materialsTable,
  materialClassesTable,
  quizAttemptsTable,
  oralSessionsTable,
  modulesTable,
  institutionModulesTable,
} from "@sillabo/db";
import type { GradedAnswerRecord } from "@sillabo/db";
import {
  ListInstitutionsResponse,
  CreateInstitutionBody,
  CreateInstitutionResponse,
  GetInstitutionDashboardParams,
  GetInstitutionDashboardResponse,
  ListInstitutionModulesParams,
  ListInstitutionModulesResponse,
  ToggleInstitutionModuleParams,
  ToggleInstitutionModuleBody,
  ToggleInstitutionModuleResponse,
} from "@sillabo/api-zod";
import { requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/institutions", requireTeacher, async (_req, res): Promise<void> => {
  const rows = await db.select().from(institutionsTable).orderBy(institutionsTable.id);
  res.json(ListInstitutionsResponse.parse(rows));
});

router.post("/institutions", requireTeacher, async (req, res): Promise<void> => {
  const parsed = CreateInstitutionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [institution] = await db.insert(institutionsTable).values(parsed.data).returning();
  res.status(201).json(CreateInstitutionResponse.parse(institution));
});

router.get("/institutions/:id/dashboard", requireTeacher, async (req, res): Promise<void> => {
  const params = GetInstitutionDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [institution] = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.id, params.data.id));

  if (!institution) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }

  const classes = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.institutionId, institution.id));
  const classIds = classes.map((c) => c.id);

  const students = classIds.length
    ? await db.select().from(studentsTable).where(inArray(studentsTable.classId, classIds))
    : [];

  const materialClassLinks = classIds.length
    ? await db
        .select({ materialId: materialClassesTable.materialId, classId: materialClassesTable.classId })
        .from(materialClassesTable)
        .where(inArray(materialClassesTable.classId, classIds))
    : [];
  const materialIds = Array.from(new Set(materialClassLinks.map((l) => l.materialId)));
  const classIdsByMaterialId = new Map<number, number[]>();
  for (const link of materialClassLinks) {
    const list = classIdsByMaterialId.get(link.materialId) ?? [];
    list.push(link.classId);
    classIdsByMaterialId.set(link.materialId, list);
  }

  const materials = materialIds.length
    ? await db.select().from(materialsTable).where(inArray(materialsTable.id, materialIds))
    : [];

  const quizAttempts = materialIds.length
    ? await db.select().from(quizAttemptsTable).where(inArray(quizAttemptsTable.materialId, materialIds))
    : [];
  const oralSessions = materialIds.length
    ? await db.select().from(oralSessionsTable).where(inArray(oralSessionsTable.materialId, materialIds))
    : [];

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
      if (!answer.topic) continue;
      const stat = topicStats.get(answer.topic) ?? { correct: 0, total: 0 };
      stat.total += 1;
      if (answer.correct) stat.correct += 1;
      topicStats.set(answer.topic, stat);
    }
  }
  const topicGaps = Array.from(topicStats.entries())
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

  const classBreakdown = classes.map((cls) => {
    const classMaterialIds = new Set(
      materials.filter((m) => (classIdsByMaterialId.get(m.id) ?? []).includes(cls.id)).map((m) => m.id),
    );
    const classAttempts = quizAttempts.filter((a) => classMaterialIds.has(a.materialId));
    const classAvg = classAttempts.length
      ? Math.round(
          (classAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) /
            classAttempts.length) *
            1000,
        ) / 10
      : 0;
    const classStudentScores = new Map<string, { correct: number; total: number }>();
    for (const attempt of classAttempts) {
      const stat = classStudentScores.get(attempt.studentName) ?? { correct: 0, total: 0 };
      stat.correct += attempt.score;
      stat.total += attempt.total;
      classStudentScores.set(attempt.studentName, stat);
    }
    const atRiskCount = Array.from(classStudentScores.values()).filter(
      (stat) => stat.total > 0 && stat.correct / stat.total < 0.5,
    ).length;

    return {
      classId: cls.id,
      className: cls.name,
      studentsCount: students.filter((s) => s.classId === cls.id).length,
      averageQuizScorePercent: classAvg,
      atRiskCount,
    };
  });

  res.json(
    GetInstitutionDashboardResponse.parse({
      institutionId: institution.id,
      institutionName: institution.name,
      classesCount: classes.length,
      studentsCount: students.length,
      materialsCount: materials.length,
      averageQuizScorePercent,
      averageOralGrade,
      topicGaps,
      atRiskStudents,
      classBreakdown,
    }),
  );
});

router.get("/institutions/:id/modules", requireTeacher, async (req, res): Promise<void> => {
  const params = ListInstitutionModulesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const modules = await db.select().from(modulesTable).orderBy(modulesTable.id);
  const activations = await db
    .select()
    .from(institutionModulesTable)
    .where(eq(institutionModulesTable.institutionId, params.data.id));
  const activeByModuleId = new Map(activations.map((a) => [a.moduleId, a.active]));

  const result = modules.map((m) => ({
    ...m,
    active: activeByModuleId.get(m.id) ?? false,
  }));

  res.json(ListInstitutionModulesResponse.parse(result));
});

router.patch("/institutions/:id/modules/:moduleId", requireTeacher, async (req, res): Promise<void> => {
  const params = ToggleInstitutionModuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ToggleInstitutionModuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [module] = await db.select().from(modulesTable).where(eq(modulesTable.id, params.data.moduleId));
  if (!module) {
    res.status(404).json({ error: "Modulo non trovato" });
    return;
  }

  const [existing] = await db
    .select()
    .from(institutionModulesTable)
    .where(
      and(
        eq(institutionModulesTable.institutionId, params.data.id),
        eq(institutionModulesTable.moduleId, params.data.moduleId),
      ),
    );

  if (existing) {
    await db
      .update(institutionModulesTable)
      .set({ active: parsed.data.active })
      .where(eq(institutionModulesTable.id, existing.id));
  } else {
    await db.insert(institutionModulesTable).values({
      institutionId: params.data.id,
      moduleId: params.data.moduleId,
      active: parsed.data.active,
    });
  }

  res.json(
    ToggleInstitutionModuleResponse.parse({
      ...module,
      active: parsed.data.active,
    }),
  );
});

export default router;
