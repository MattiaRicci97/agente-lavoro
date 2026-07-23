import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, studentsTable, photoCorrectionsTable } from "@sillabo/db";
import { requireAuth } from "../middlewares/auth";
import { downloadObject } from "../lib/storage";
import { correctPhotoHomework, type ImageMediaType } from "../lib/ai";

const router: IRouter = Router();

const CreateSchema = z.object({
  imageObjectPath: z.string().min(1),
  fileName: z.string().min(1),
  subject: z.string().trim().min(1).max(100),
  gradeLevel: z.string().trim().max(100).optional().default(""),
  assignmentPrompt: z.string().trim().max(2000).optional(),
  materialId: z.number().int().positive().nullable().optional(),
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite prudente per la visione

function mediaTypeFromName(fileName: string): ImageMediaType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

/** Correzione di un compito da foto (studente autenticato). */
router.post("/photo-corrections", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { imageObjectPath, fileName, subject, gradeLevel, assignmentPrompt, materialId } = parsed.data;

  const mediaType = mediaTypeFromName(fileName);
  if (!mediaType) {
    res.status(400).json({ error: "Formato immagine non supportato. Usa una foto JPG o PNG." });
    return;
  }

  // Nome dello studente dalla sua iscrizione (fallback: nome dal profilo).
  const [membership] = await db
    .select({ name: studentsTable.name })
    .from(studentsTable)
    .where(eq(studentsTable.authUserId, req.authUserId!));
  const studentName = membership?.name ?? req.authUser!.name;

  let imageBase64: string;
  try {
    const buffer = await downloadObject(req.accessToken!, imageObjectPath);
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: "La foto è troppo grande. Riprova con una foto più leggera." });
      return;
    }
    imageBase64 = buffer.toString("base64");
  } catch (err) {
    req.log.error({ err }, "Impossibile scaricare l'immagine del compito");
    res.status(400).json({ error: "Impossibile leggere la foto caricata. Riprova." });
    return;
  }

  let result;
  try {
    result = await correctPhotoHomework(
      imageBase64,
      mediaType,
      subject,
      gradeLevel,
      assignmentPrompt ?? null,
    );
  } catch (err) {
    req.log.error({ err }, "Correzione foto fallita");
    res.status(500).json({ error: "La correzione non è riuscita. Riprova con una foto più nitida." });
    return;
  }

  const [row] = await db
    .insert(photoCorrectionsTable)
    .values({
      authUserId: req.authUserId!,
      studentName,
      subject,
      gradeLevel,
      materialId: materialId ?? null,
      assignmentPrompt: assignmentPrompt ?? null,
      imageObjectPath,
      transcription: result.transcription ?? "",
      grade: typeof result.grade === "number" ? Math.round(result.grade) : null,
      feedback: result.feedback ?? "",
      strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 8) : [],
      improvements: Array.isArray(result.improvements) ? result.improvements.slice(0, 8) : [],
    })
    .returning();

  res.status(201).json(row);
});

/** Storico delle correzioni dello studente autenticato. */
router.get("/photo-corrections/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(photoCorrectionsTable)
    .where(eq(photoCorrectionsTable.authUserId, req.authUserId!))
    .orderBy(desc(photoCorrectionsTable.createdAt))
    .limit(30);
  res.json(rows);
});

export default router;
