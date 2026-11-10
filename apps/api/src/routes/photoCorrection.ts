import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, studentsTable, photoCorrectionsTable } from "@sillabo/db";
import { requireAuth } from "../middlewares/auth";
import { downloadObject } from "../lib/storage";
import { correctPhotoHomework, type ImageMediaType } from "../lib/ai";
import {
  candidateObjectivesForStudentWork,
  toCandidates,
  storeDiagnosis,
  diagnosisForSources,
} from "../lib/diagnosis";

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

  // Nome e classe dello studente dalla sua iscrizione (fallback: nome dal profilo).
  const [membership] = await db
    .select({ name: studentsTable.name, classId: studentsTable.classId })
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

  const candidates = await candidateObjectivesForStudentWork({
    classId: membership?.classId ?? null,
    subject,
    gradeLevel,
    materialId: materialId ?? null,
  });

  let result;
  try {
    result = await correctPhotoHomework(
      imageBase64,
      mediaType,
      subject,
      gradeLevel,
      assignmentPrompt ?? null,
      toCandidates(candidates),
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
      classId: membership?.classId ?? null,
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

  try {
    const stored = await storeDiagnosis({
      sourceKind: "foto",
      sourceId: row.id,
      authUserId: req.authUserId!,
      classId: membership?.classId ?? null,
      items: result.diagnosis,
      candidates,
    });
    if (!stored) req.log.warn({ photoCorrectionId: row.id }, "Nessuna diagnosi valida dal modello");
  } catch (err) {
    req.log.error({ err, photoCorrectionId: row.id }, "Diagnosi non salvata");
  }

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
  const diagnosis = await diagnosisForSources(
    "foto",
    rows.filter((r) => r.validationStatus === "validata").map((r) => r.id),
    { onlyValidated: true },
  );
  res.json(
    rows.map((r) => ({
      ...r,
      diagnosis: (diagnosis.get(r.id) ?? []).map((d) => ({
        exercise: d.exercise,
        objective: d.teacher?.objective ?? null,
        outcome: d.teacher?.outcome ?? d.ai.outcome,
        errorType: d.teacher?.errorType ?? null,
        evidence: d.ai.evidence,
      })),
    })),
  );
});

export default router;
