import { Router, type IRouter } from "express";
import { eq, asc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, materialsTable, questionsTable, teachersTable } from "@sillabo/db";
import {
  GenerateQuestionsParams,
  GenerateQuestionsResponse,
  ListQuestionsParams,
  ListQuestionsResponse,
} from "@sillabo/api-zod";
import { generateActiveRecallQuestions, generateHints, normalizeHints, MAX_HINTS } from "../lib/ai";
import { teacherCanManageMaterial } from "../lib/materialAccess";
import { requireAuth, requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const DIFFICULTIES = ["facile", "medio", "difficile"] as const;

const HintsField = z.array(z.string().max(300)).max(MAX_HINTS);

const EditQuestionSchema = z.object({
  hints: HintsField.optional(),
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
  hints: HintsField.default([]),
});

/** true se l'utente autenticato è un docente (vede anche le bozze). */
async function isTeacher(authUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, authUserId));
  return !!row;
}

/**
 * Aggiunge gli aiuti alla risposta (lo schema generato non li conosce).
 * Lo studente riceve solo quelli approvati dal docente.
 */
function withHints<T extends { id: number }>(
  items: T[],
  rows: Array<{ id: number; hints: string[]; hintsStatus: string }>,
  teacher: boolean,
): Array<T & { hints: string[]; hintsStatus?: string }> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return items.map((item) => {
    const row = byId.get(item.id);
    const hints = row?.hints ?? [];
    if (teacher) return { ...item, hints, hintsStatus: row?.hintsStatus ?? "approvati" };
    return { ...item, hints: row?.hintsStatus === "approvati" ? hints : [] };
  });
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
        hints: q.hints,
        hintsStatus: "bozza",
      })),
    )
    .returning();

  res.status(201).json(withHints(GenerateQuestionsResponse.parse(rows), rows, true));
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

  res.json(withHints(ListQuestionsResponse.parse(rows), rows, teacher));
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

  // Gli aiuti salvati dal docente sono suoi: da quel momento sono approvati.
  const hintsPatch =
    parsed.data.hints !== undefined ? { hints: normalizeHints(parsed.data.hints), hintsStatus: "approvati" } : {};

  const [updated] = await db
    .update(questionsTable)
    .set({
      ...parsed.data,
      ...hintsPatch,
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
    .set({ status: "approvata", hintsStatus: "approvati" })
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
    .set({ status: "approvata", hintsStatus: "approvati" })
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
      hints: normalizeHints(parsed.data.hints),
      hintsStatus: "approvati",
      status: "approvata",
      authorType: "docente",
    })
    .returning();

  res.status(201).json(row);
});

/**
 * L'assistente propone gli aiuti per le domande che non ne hanno. Restano in
 * bozza: gli studenti non li vedono finche' il docente non li approva.
 */
router.post("/materials/:id/questions/hints", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId) || !(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId));
  const missing = await db
    .select()
    .from(questionsTable)
    .where(and(eq(questionsTable.materialId, materialId), sql`jsonb_array_length(${questionsTable.hints}) = 0`))
    .orderBy(asc(questionsTable.id))
    .limit(40);
  if (!material || !missing.length) {
    res.json({ prepared: 0 });
    return;
  }
  try {
    const drafts = await generateHints({
      subject: material.subject,
      gradeLevel: material.gradeLevel,
      questions: missing.map((q) => ({ id: q.id, question: q.question, answer: q.answer })),
    });
    for (const [id, hints] of drafts) {
      await db.update(questionsTable).set({ hints, hintsStatus: "bozza" }).where(eq(questionsTable.id, id));
    }
    res.json({ prepared: drafts.size });
  } catch (err) {
    req.log.error({ err }, "Generazione aiuti fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a preparare gli aiuti. Riprova, o scrivili tu." });
  }
});

/** Il docente approva in blocco gli aiuti in bozza delle domande gia' approvate. */
router.post("/materials/:id/questions/hints/approve", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId) || !(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const rows = await db
    .update(questionsTable)
    .set({ hintsStatus: "approvati" })
    .where(and(eq(questionsTable.materialId, materialId), eq(questionsTable.hintsStatus, "bozza")))
    .returning({ id: questionsTable.id });
  res.json({ approved: rows.length });
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
