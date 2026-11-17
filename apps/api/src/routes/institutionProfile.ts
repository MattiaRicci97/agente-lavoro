import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, institutionsTable, institutionMembersTable, studentsTable, classesTable, teachersTable } from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { institutionIdsFor } from "../lib/audience";
import { INSTITUTION_KINDS, PROFILES, resolveProfile } from "../lib/institutionProfile";
import { GRADE_SCALES, scaleFor } from "../lib/gradeScale";

const router: IRouter = Router();

/**
 * Il profilo con cui l'interfaccia si presenta a chi chiama: quali funzioni
 * mostrare e con quali parole. Per un amministratore, anche gli istituti di
 * cui puo' cambiare il tipo.
 */
router.get("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const ids = await institutionIdsFor(req.authUserId!);
  const institutions = ids.length
    ? await db
        .select({ id: institutionsTable.id, name: institutionsTable.name, kind: institutionsTable.kind, gradeScale: institutionsTable.gradeScale })
        .from(institutionsTable)
        .where(inArray(institutionsTable.id, ids))
    : [];
  const profile = resolveProfile(institutions.map((i) => i.kind));
  // La scala dei voti: se gli istituti ne usano piu' d'una, i decimi.
  const scales = new Set(institutions.map((i) => scaleFor(i.kind, i.gradeScale)));
  const gradeScale = scales.size === 1 ? Array.from(scales)[0] : "decimi";

  const [teacher] = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.authUserId, req.authUserId!));
  const adminOf = teacher
    ? await db
        .select({ id: institutionsTable.id, name: institutionsTable.name, kind: institutionsTable.kind, gradeScale: institutionsTable.gradeScale })
        .from(institutionMembersTable)
        .innerJoin(institutionsTable, eq(institutionsTable.id, institutionMembersTable.institutionId))
        .where(and(eq(institutionMembersTable.teacherId, teacher.id), eq(institutionMembersTable.role, "amministratore")))
    : [];

  res.json({
    ...profile,
    gradeScale,
    adminInstitutions: adminOf.map((i) => ({ ...i, gradeScale: scaleFor(i.kind, i.gradeScale), gradeScaleChosen: i.gradeScale !== null })),
    kinds: INSTITUTION_KINDS.map((k) => ({ kind: k, label: PROFILES[k].label })),
  });
});

const KindBody = z
  .object({
    kind: z.enum(INSTITUTION_KINDS).optional(),
    /** null = torna alla scala tipica del tipo di istituto. */
    gradeScale: z.enum(GRADE_SCALES).nullable().optional(),
  })
  .refine((b) => b.kind !== undefined || b.gradeScale !== undefined);

/**
 * Solo un amministratore dell'istituto ne cambia il tipo e la scala dei voti.
 * La scala vale per le consegne nuove: quelle gia' fatte restano nella loro.
 */
router.put("/institutions/:id/kind", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [membership] = Number.isInteger(id)
    ? await db
        .select({ role: institutionMembersTable.role })
        .from(institutionMembersTable)
        .where(and(eq(institutionMembersTable.institutionId, id), eq(institutionMembersTable.teacherId, req.teacher!.id)))
    : [];
  if (!membership) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }
  if (membership.role !== "amministratore") {
    res.status(403).json({ error: "Solo un amministratore dell'istituto può cambiarne il tipo" });
    return;
  }
  const parsed = KindBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Tipo di istituto o scala dei voti non validi" });
    return;
  }
  const [updated] = await db
    .update(institutionsTable)
    .set({
      ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
      ...(parsed.data.gradeScale !== undefined ? { gradeScale: parsed.data.gradeScale } : {}),
    })
    .where(eq(institutionsTable.id, id))
    .returning({ id: institutionsTable.id, kind: institutionsTable.kind, gradeScale: institutionsTable.gradeScale });
  res.json(updated);
});

export default router;
