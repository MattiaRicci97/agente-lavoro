import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, materialsTable, questionsTable } from "@sillabo/db";
import {
  GenerateQuestionsParams,
  GenerateQuestionsResponse,
  ListQuestionsParams,
  ListQuestionsResponse,
} from "@sillabo/api-zod";
import { generateActiveRecallQuestions } from "../lib/ai";
import { requireAuth, requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/materials/:id/generate-questions", requireTeacher, async (req, res): Promise<void> => {
  const params = GenerateQuestionsParams.safeParse(req.params);
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

  req.log.info({ materialId: material.id }, "Generating active recall questions");

  const generated = await generateActiveRecallQuestions(
    material.title,
    material.subject,
    material.gradeLevel,
    material.content,
  );

  const rows = await db
    .insert(questionsTable)
    .values(
      generated.map((q) => ({
        materialId: material.id,
        question: q.question,
        answer: q.answer,
        topic: q.topic,
        difficulty: q.difficulty,
      })),
    )
    .returning();

  res.status(201).json(GenerateQuestionsResponse.parse(rows));
});

router.get("/materials/:id/questions", requireAuth, async (req, res): Promise<void> => {
  const params = ListQuestionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.materialId, params.data.id))
    .orderBy(asc(questionsTable.id));

  res.json(ListQuestionsResponse.parse(rows));
});

export default router;
