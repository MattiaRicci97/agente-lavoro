import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, materialsTable, questionsTable, teachersTable } from "@sillabo/db";
import {
  GenerateQuestionsParams,
  GenerateQuestionsResponse,
  ListQuestionsParams,
  ListQuestionsResponse,
} from "@sillabo/api-zod";
import { generateActiveRecallQuestions } from "../lib/ai";
import { requireAuth, requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const DIFFICULTIES = ["facile", "medio", "difficile"] as const;

const EditQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000).optional(),
  answer: z.string().trim().min(1).max(4000).optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
});

const CreateQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(4000),
  topic: z.string().trim().min(1).max(200),
  difficulty: z.enum(DIFFICULTIES).default("medio"),
});

/** true se l'utente autenticato è un docente (vede anche le bozze). */
async function isTeacher(authUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, authUserId));
  return !!row;
}

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

  // Prima stesura dell'AI: sono bozze finché il docente non le approva.
  const rows = await db
    .insert(questionsTable)
    .values(
      generated.map((q) => ({
        materialId: material.id,
        question: q.question,
        answer: q.answer,
        topic: q.topic,
        difficulty: q.difficulty,
        status: "bozza",
        authorType: "ai",
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

  // Il docente vede anche le bozze; lo studente solo le domande approvate.
  const teacher = await isTeacher(req.authUserId!);
  const where = teacher
    ? eq(questionsTable.materialId, params.data.id)
    : and(eq(questionsTable.materialId, params.data.id), eq(questionsTable.status, "approvata"));

  const rows = await db.select().from(questionsTable).where(where).orderBy(asc(questionsTable.id));

  res.json(ListQuestionsResponse.parse(rows));
});

/** Il docente riscrive una domanda: resta sua, non dell'AI. */
router.patch("/questions/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = EditQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Domanda non trovata" });
    return;
  }

  const textChanged =
    (parsed.data.question !== undefined && parsed.data.question !== existing.question) ||
    (parsed.data.answer !== undefined && parsed.data.answer !== existing.answer);

  const [updated] = await db
    .update(questionsTable)
    .set({
      ...parsed.data,
      editedByTeacher: existing.editedByTeacher || textChanged,
    })
    .where(eq(questionsTable.id, id))
    .returning();

  res.json(updated);
});

/** Approva una singola bozza. */
router.post("/questions/:id/approve", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [updated] = await db
    .update(questionsTable)
    .set({ status: "approvata" })
    .where(eq(questionsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Domanda non trovata" });
    return;
  }
  res.json(updated);
});

/** Approva in blocco tutte le bozze di un materiale (per chi si fida della stesura). */
router.post("/materials/:id/questions/approve-all", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const rows = await db
    .update(questionsTable)
    .set({ status: "approvata" })
    .where(and(eq(questionsTable.materialId, materialId), eq(questionsTable.status, "bozza")))
    .returning();

  res.json({ approved: rows.length });
});

/** Il docente scrive una domanda propria: nasce già approvata. */
router.post("/materials/:id/questions", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = CreateQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const [row] = await db
    .insert(questionsTable)
    .values({
      materialId,
      ...parsed.data,
      status: "approvata",
      authorType: "docente",
    })
    .returning();

  res.status(201).json(row);
});

/** Elimina una domanda (anche una bozza che non convince). */
router.delete("/questions/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [deleted] = await db.delete(questionsTable).where(eq(questionsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Domanda non trovata" });
    return;
  }
  res.status(204).end();
});

export default router;
