import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, materialsTable, materialClassesTable, materialToolsTable, studentsTable, type MaterialTool } from "@sillabo/db";
import { requireAuth, requireTeacher, findApprovedStudentForMaterial } from "../middlewares/auth";
import { teacherCanManageMaterial } from "../lib/materialAccess";
import { draftMaterialTool } from "../lib/ai";
import { isToolKind, SHAREABLE_KINDS, TOOL_INSTRUCTIONS, TRANSLATION_LANGUAGES, type ToolKind } from "../lib/materialTools";

const router: IRouter = Router();

/**
 * Strumenti per la lezione: l'assistente propone, il docente riscrive e
 * decide se glossario e traduzione arrivano alla classe.
 */

const teacherView = (t: MaterialTool) => ({
  kind: t.kind,
  language: t.language,
  body: t.body,
  shared: t.shared,
  /** true se il testo e' ancora quello scritto dall'assistente. */
  untouched: t.body === t.aiDraft,
  updatedAt: t.updatedAt,
});

/** Il materiale e lo strumento richiesto, solo per un docente che puo' gestirlo. */
async function materialAndKind(req: Request, res: Response): Promise<{ materialId: number; kind: ToolKind } | null> {
  const materialId = Number(req.params.id);
  const kind = String(req.params.kind ?? "");
  if (!Number.isInteger(materialId) || !(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return null;
  }
  if (!isToolKind(kind)) {
    res.status(400).json({ error: "Strumento sconosciuto" });
    return null;
  }
  return { materialId, kind };
}

router.get("/materials/:id/tools", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId) || !(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const rows = await db.select().from(materialToolsTable).where(eq(materialToolsTable.materialId, materialId));
  res.json({ tools: rows.map(teacherView), languages: TRANSLATION_LANGUAGES });
});

const DraftBody = z.object({ language: z.enum(TRANSLATION_LANGUAGES).optional() });

/** L'assistente scrive una nuova stesura. Qualsiasi nuova stesura toglie la condivisione. */
router.post("/materials/:id/tools/:kind/draft", requireTeacher, async (req, res): Promise<void> => {
  const target = await materialAndKind(req, res);
  if (!target) return;
  const parsed = DraftBody.safeParse(req.body ?? {});
  if (!parsed.success || (target.kind === "traduzione" && !parsed.data.language)) {
    res.status(400).json({ error: "Scegli la lingua della traduzione tra quelle disponibili" });
    return;
  }
  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, target.materialId));
  const language = target.kind === "traduzione" ? parsed.data.language! : null;
  try {
    const draft = await draftMaterialTool({
      instructions: TOOL_INSTRUCTIONS[target.kind],
      language,
      title: material.title,
      subject: material.subject,
      gradeLevel: material.gradeLevel,
      content: material.content,
    });
    const values = { aiDraft: draft, body: draft, language, shared: false, updatedByTeacherId: req.teacher!.id, updatedAt: new Date() };
    const [row] = await db
      .insert(materialToolsTable)
      .values({ materialId: target.materialId, kind: target.kind, ...values })
      .onConflictDoUpdate({ target: [materialToolsTable.materialId, materialToolsTable.kind], set: values })
      .returning();
    res.json(teacherView(row));
  } catch (err) {
    req.log.error({ err, kind: target.kind }, "Bozza dello strumento fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a preparare la bozza. Riprova, o scrivila tu." });
  }
});

const SaveBody = z.object({ body: z.string().trim().min(1).max(20000), shared: z.boolean().default(false) });

/** Il docente salva il suo testo e decide se condividerlo. */
router.put("/materials/:id/tools/:kind", requireTeacher, async (req, res): Promise<void> => {
  const target = await materialAndKind(req, res);
  if (!target) return;
  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Il testo non puo' essere vuoto" });
    return;
  }
  if (parsed.data.shared && !SHAREABLE_KINDS.has(target.kind)) {
    res.status(400).json({ error: "Questo strumento e' solo per il docente e non si condivide con la classe" });
    return;
  }
  const values = { body: parsed.data.body, shared: parsed.data.shared, updatedByTeacherId: req.teacher!.id, updatedAt: new Date() };
  const [row] = await db
    .insert(materialToolsTable)
    .values({ materialId: target.materialId, kind: target.kind, ...values })
    .onConflictDoUpdate({ target: [materialToolsTable.materialId, materialToolsTable.kind], set: values })
    .returning();
  res.json(teacherView(row));
});

router.delete("/materials/:id/tools/:kind", requireTeacher, async (req, res): Promise<void> => {
  const target = await materialAndKind(req, res);
  if (!target) return;
  await db
    .delete(materialToolsTable)
    .where(and(eq(materialToolsTable.materialId, target.materialId), eq(materialToolsTable.kind, target.kind)));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Studente
// ---------------------------------------------------------------------------

/** I materiali dello studente che hanno qualcosa di condiviso (per mostrare il pulsante). */
router.get("/me/shared-tools", requireAuth, async (req, res): Promise<void> => {
  const students = await db.select({ classId: studentsTable.classId }).from(studentsTable).where(eq(studentsTable.authUserId, req.authUserId!));
  if (!students.length) {
    res.json({ materialIds: [] });
    return;
  }
  const rows = await db
    .selectDistinct({ materialId: materialToolsTable.materialId })
    .from(materialToolsTable)
    .innerJoin(materialClassesTable, eq(materialClassesTable.materialId, materialToolsTable.materialId))
    .where(and(eq(materialToolsTable.shared, true), inArray(materialClassesTable.classId, students.map((s) => s.classId))));
  res.json({ materialIds: rows.map((r) => r.materialId) });
});

/** Glossario e traduzione condivisi dal docente per un materiale. */
router.get("/materials/:id/shared-tools", requireAuth, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId) || !(await findApprovedStudentForMaterial(req.authUserId!, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const rows = await db
    .select()
    .from(materialToolsTable)
    .where(and(eq(materialToolsTable.materialId, materialId), eq(materialToolsTable.shared, true)));
  res.json({
    tools: rows
      .filter((t) => SHAREABLE_KINDS.has(t.kind as ToolKind))
      .map((t) => ({ kind: t.kind, language: t.language, body: t.body })),
  });
});

export default router;
