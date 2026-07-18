import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, materialsTable, materialClassesTable, questionsTable } from "@sillabo/db";
import {
  CreateMaterialBody,
  ListMaterialsResponse,
  GetMaterialParams,
  GetMaterialResponse,
  DeleteMaterialParams,
  SimplifyMaterialParams,
  SimplifyMaterialResponse,
} from "@sillabo/api-zod";
import { classifyCurriculumTopic, generateSimplifiedContent, generateWrittenExamPrompt } from "../lib/ai";
import { z } from "zod/v4";
import { attachClassIds } from "../lib/materialClasses";
import {
  extractTextFromUploadedFile,
  UnsupportedFileTypeError,
  EmptyExtractedContentError,
} from "../lib/fileExtraction";
import { requireAuth, requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const materialColumns = {
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
};

/**
 * Genera una verifica stampabile (solo testo) dal materiale, per l'uso in
 * classe su carta. Non salva nulla: il docente la stampa o la salva in PDF.
 */
router.post("/materials/:id/printable-exam", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = z.object({ examType: z.enum(["tema", "versione", "problema"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  try {
    const { prompt } = await generateWrittenExamPrompt(
      parsed.data.examType,
      material.title,
      material.subject,
      material.gradeLevel,
      material.content,
    );
    res.json({
      prompt,
      title: material.title,
      subject: material.subject,
      gradeLevel: material.gradeLevel,
      examType: parsed.data.examType,
    });
  } catch (err) {
    req.log.error({ err }, "Printable exam generation failed");
    res.status(500).json({ error: "Impossibile generare la verifica. Riprova." });
  }
});

router.get("/materials", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      ...materialColumns,
      questionCount: sql<number>`count(${questionsTable.id})::int`,
    })
    .from(materialsTable)
    .leftJoin(questionsTable, eq(questionsTable.materialId, materialsTable.id))
    .groupBy(materialsTable.id)
    .orderBy(desc(materialsTable.createdAt));

  res.json(ListMaterialsResponse.parse(await attachClassIds(rows)));
});

router.post("/materials", requireTeacher, async (req, res): Promise<void> => {
  const parsed = CreateMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { classIds, fileUrl, fileName, content, ...rest } = parsed.data;

  let finalContent = content?.trim() ?? "";

  if (fileUrl) {
    if (!fileName) {
      res.status(400).json({ error: "fileName e' richiesto quando si carica un file" });
      return;
    }
    try {
      finalContent = await extractTextFromUploadedFile(req.accessToken!, fileUrl, fileName);
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError || err instanceof EmptyExtractedContentError) {
        res.status(400).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to extract text from uploaded file");
      res.status(500).json({ error: "Impossibile leggere il file caricato. Riprova." });
      return;
    }
  }

  if (!finalContent || finalContent.length < 10) {
    res
      .status(400)
      .json({ error: "Carica un file (PDF/Word) o incolla il contenuto del materiale (minimo 10 caratteri)" });
    return;
  }

  const materialInput = {
    ...rest,
    content: finalContent,
    fileUrl: fileUrl ?? null,
    fileName: fileName ?? null,
  };
  const [material] = await db.insert(materialsTable).values(materialInput).returning();

  if (classIds?.length) {
    await db
      .insert(materialClassesTable)
      .values(classIds.map((classId) => ({ materialId: material.id, classId })));
  }

  req.log.info({ materialId: material.id }, "Classifying curriculum topic");
  try {
    const { topic, subtopic } = await classifyCurriculumTopic(
      material.title,
      material.subject,
      material.gradeLevel,
      material.content,
    );
    const [updated] = await db
      .update(materialsTable)
      .set({ curriculumTopic: topic, curriculumSubtopic: subtopic })
      .where(eq(materialsTable.id, material.id))
      .returning();

    res
      .status(201)
      .json(GetMaterialResponse.parse({ ...updated, classIds: classIds ?? [], questionCount: 0 }));
  } catch (err) {
    req.log.error({ err }, "Curriculum classification failed, saving material without tags");
    res
      .status(201)
      .json(GetMaterialResponse.parse({ ...material, classIds: classIds ?? [], questionCount: 0 }));
  }
});

router.get("/materials/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({
      ...materialColumns,
      questionCount: sql<number>`count(${questionsTable.id})::int`,
    })
    .from(materialsTable)
    .leftJoin(questionsTable, eq(questionsTable.materialId, materialsTable.id))
    .where(eq(materialsTable.id, params.data.id))
    .groupBy(materialsTable.id);

  if (!row) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const [withClassIds] = await attachClassIds([row]);
  res.json(GetMaterialResponse.parse(withClassIds));
});

router.post("/materials/:id/simplify", requireTeacher, async (req, res): Promise<void> => {
  const params = SimplifyMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, params.data.id));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  req.log.info({ materialId: material.id }, "Generating simplified BES/DSA content");

  const simplifiedContent = await generateSimplifiedContent(
    material.title,
    material.subject,
    material.gradeLevel,
    material.content,
  );

  const [row] = await db
    .update(materialsTable)
    .set({ simplifiedContent })
    .where(eq(materialsTable.id, material.id))
    .returning();

  const [{ questionCount }] = await db
    .select({ questionCount: sql<number>`count(*)::int` })
    .from(questionsTable)
    .where(eq(questionsTable.materialId, material.id));

  const [withClassIds] = await attachClassIds([row]);
  res.json(SimplifyMaterialResponse.parse({ ...withClassIds, questionCount }));
});

router.delete("/materials/:id", requireTeacher, async (req, res): Promise<void> => {
  const params = DeleteMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(materialsTable)
    .where(eq(materialsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  res.sendStatus(204);
});

export default router;
