import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, materialsTable, writtenExamsTable } from "@sillabo/db";
import {
  ListWrittenExamsParams,
  ListWrittenExamsResponse,
  GenerateWrittenExamParams,
  GenerateWrittenExamBody,
  GenerateWrittenExamResponse,
  SubmitWrittenExamParams,
  SubmitWrittenExamBody,
  SubmitWrittenExamResponse,
} from "@sillabo/api-zod";
import { generateWrittenExamPrompt, gradeWrittenExam } from "../lib/ai";
import { requireAuth, requireTeacher, findApprovedStudentForMaterial } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/materials/:id/written-exams", requireAuth, async (req, res): Promise<void> => {
  const params = ListWrittenExamsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(writtenExamsTable)
    .where(eq(writtenExamsTable.materialId, params.data.id))
    .orderBy(desc(writtenExamsTable.createdAt));

  res.json(ListWrittenExamsResponse.parse(rows));
});

router.post("/materials/:id/written-exams", requireTeacher, async (req, res): Promise<void> => {
  const params = GenerateWrittenExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = GenerateWrittenExamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
      status: "da_svolgere",
    })
    .returning();

  res.status(201).json(GenerateWrittenExamResponse.parse(exam));
});

router.post("/written-exams/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const params = SubmitWrittenExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitWrittenExamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [exam] = await db.select().from(writtenExamsTable).where(eq(writtenExamsTable.id, params.data.id));
  if (!exam) {
    res.status(404).json({ error: "Verifica non trovata" });
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

  req.log.info({ examId: exam.id }, "Grading written exam");

  const { grade, feedback } = await gradeWrittenExam(
    exam.examType,
    exam.prompt,
    material.subject,
    parsed.data.studentAnswer,
  );

  const [updated] = await db
    .update(writtenExamsTable)
    .set({
      studentName: student.name,
      studentAnswer: parsed.data.studentAnswer,
      grade,
      feedback,
      status: "corretta",
    })
    .where(eq(writtenExamsTable.id, exam.id))
    .returning();

  res.json(SubmitWrittenExamResponse.parse(updated));
});

export default router;
