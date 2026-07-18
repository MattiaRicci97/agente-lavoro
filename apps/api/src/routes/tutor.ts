import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, materialsTable } from "@sillabo/db";
import { requireAuth, findApprovedStudentForMaterial } from "../middlewares/auth";
import { askStudyTutor } from "../lib/ai";

const router: IRouter = Router();

const AskTutorSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .default([]),
});

/** Tutor di studio: chiarisce i dubbi dello studente sul materiale (non interroga). */
router.post("/materials/:id/tutor", requireAuth, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const parsed = AskTutorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const student = await findApprovedStudentForMaterial(req.authUserId!, materialId);
  if (!student) {
    res.status(403).json({ error: "Non sei iscritto a una classe con accesso a questo materiale" });
    return;
  }

  try {
    const answer = await askStudyTutor(
      {
        title: material.title,
        subject: material.subject,
        gradeLevel: material.gradeLevel,
        content: material.content,
      },
      req.authUser!.besDsa,
      parsed.data.history,
      parsed.data.question,
    );
    res.json({ answer });
  } catch (err) {
    req.log.error({ err }, "Study tutor failed");
    res.status(500).json({ error: "Il tutor non e' riuscito a rispondere. Riprova." });
  }
});

export default router;
