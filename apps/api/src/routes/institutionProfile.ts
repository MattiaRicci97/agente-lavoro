import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, institutionsTable, institutionMembersTable, studentsTable, classesTable, teachersTable } from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { teacherInstitutionIds } from "../lib/objectives";
import { INSTITUTION_KINDS, PROFILES, resolveProfile } from "../lib/institutionProfile";

const router: IRouter = Router();

/** Gli istituti di chi chiama: come docente (membro o tramite classi) e come studente. */
async function institutionIdsFor(authUserId: string): Promise<number[]> {
  const ids = new Set<number>();
  const [teacher] = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.authUserId, authUserId));
  if (teacher) for (const id of await teacherInstitutionIds(teacher.id)) ids.add(id);
  const asStudent = await db
    .select({ institutionId: classesTable.institutionId })
    .from(studentsTable)
    .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
    .where(eq(studentsTable.authUserId, authUserId));
  for (const r of asStudent) ids.add(r.institutionId);
  return Array.from(ids);
}

/**
 * Il profilo con cui l'interfaccia si presenta a chi chiama: quali funzioni
 * mostrare e con quali parole. Per un amministratore, anche gli istituti di
 * cui puo' cambiare il tipo.
 */
router.get("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const ids = await institutionIdsFor(req.authUserId!);
  const institutions = ids.length
    ? await db.select({ id: institutionsTable.id, name: institutionsTable.name, kind: institutionsTable.kind }).from(institutionsTable).where(inArray(institutionsTable.id, ids))
    : [];
  const profile = resolveProfile(institutions.map((i) => i.kind));

  const [teacher] = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.authUserId, req.authUserId!));
  const adminOf = teacher
    ? await db
        .select({ id: institutionsTable.id, name: institutionsTable.name, kind: institutionsTable.kind })
        .from(institutionMembersTable)
        .innerJoin(institutionsTable, eq(institutionsTable.id, institutionMembersTable.institutionId))
        .where(and(eq(institutionMembersTable.teacherId, teacher.id), eq(institutionMembersTable.role, "amministratore")))
    : [];

  res.json({
    ...profile,
    adminInstitutions: adminOf,
    kinds: INSTITUTION_KINDS.map((k) => ({ kind: k, label: PROFILES[k].label })),
  });
});

const KindBody = z.object({ kind: z.enum(INSTITUTION_KINDS) });

/** Solo un amministratore dell'istituto ne cambia il tipo. */
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
    res.status(400).json({ error: "Tipo di istituto non valido" });
    return;
  }
  const [updated] = await db
    .update(institutionsTable)
    .set({ kind: parsed.data.kind })
    .where(eq(institutionsTable.id, id))
    .returning({ id: institutionsTable.id, kind: institutionsTable.kind });
  res.json(updated);
});

export default router;
