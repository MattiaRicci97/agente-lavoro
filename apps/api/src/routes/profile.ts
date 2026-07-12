import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, teachersTable, studentsTable } from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { updateUserMetadata } from "../lib/supabase";

const router: IRouter = Router();

// --- Profilo docente -------------------------------------------------------

const TeachingPlaceSchema = z.object({
  name: z.string().trim().min(1),
  contract: z.string().trim().default(""),
});

const UpdateTeacherProfileSchema = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio").optional(),
  title: z.string().trim().max(40).nullable().optional(),
  subjects: z.array(z.string().trim().min(1)).max(30).optional(),
  teachingPlaces: z.array(TeachingPlaceSchema).max(30).optional(),
});

router.get("/teachers/me", requireTeacher, async (req, res): Promise<void> => {
  res.json(req.teacher);
});

router.patch("/teachers/me", requireTeacher, async (req, res): Promise<void> => {
  const parsed = UpdateTeacherProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, title, subjects, teachingPlaces } = parsed.data;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (title !== undefined) update.title = title;
  if (subjects !== undefined) update.subjects = subjects;
  if (teachingPlaces !== undefined) update.teachingPlaces = teachingPlaces;

  if (Object.keys(update).length === 0) {
    res.json(req.teacher);
    return;
  }

  const [updated] = await db
    .update(teachersTable)
    .set(update)
    .where(eq(teachersTable.id, req.teacher!.id))
    .returning();

  // Mantieni il nome allineato anche nei metadati dell'utente.
  if (name !== undefined) {
    try {
      await updateUserMetadata(req.accessToken!, { full_name: name });
    } catch (err) {
      req.log.warn({ err }, "Non sono riuscito ad allineare il nome nei metadati utente");
    }
  }

  res.json(updated);
});

// --- Profilo studente (minimal: nome + BES/DSA) ----------------------------

const UpdateStudentProfileSchema = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio").optional(),
  besDsa: z.boolean().optional(),
});

router.get("/students/me", requireAuth, async (req, res): Promise<void> => {
  res.json({ name: req.authUser!.name, besDsa: req.authUser!.besDsa });
});

router.patch("/students/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateStudentProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, besDsa } = parsed.data;

  // Fonte di verità del profilo: i metadati dell'utente (persistono anche
  // prima di iscriversi a una classe).
  const metaUpdate: Record<string, unknown> = {};
  if (name !== undefined) metaUpdate.full_name = name;
  if (besDsa !== undefined) metaUpdate.bes_dsa = besDsa;
  if (Object.keys(metaUpdate).length > 0) {
    try {
      await updateUserMetadata(req.accessToken!, metaUpdate);
    } catch (err) {
      req.log.error({ err }, "Aggiornamento profilo studente fallito");
      res.status(500).json({ error: "Impossibile salvare il profilo. Riprova." });
      return;
    }
  }

  // Rispecchia nome/BES-DSA su tutte le iscrizioni dello studente (per il registro docente).
  const rowUpdate: Record<string, unknown> = {};
  if (name !== undefined) rowUpdate.name = name;
  if (besDsa !== undefined) rowUpdate.besDsa = besDsa;
  if (Object.keys(rowUpdate).length > 0) {
    await db.update(studentsTable).set(rowUpdate).where(eq(studentsTable.authUserId, req.authUserId!));
  }

  res.json({
    name: name ?? req.authUser!.name,
    besDsa: besDsa ?? req.authUser!.besDsa,
  });
});

export default router;
