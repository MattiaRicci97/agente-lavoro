import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  learningObjectivesTable,
  learningObjectivePrerequisitesTable,
  institutionObjectiveOverridesTable,
  materialObjectivesTable,
  materialsTable,
} from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import {
  effectiveObjectives,
  teacherCanAccessInstitution,
  teacherInstitutionIds,
  objectiveById,
  assignableObjectiveIds,
  candidateObjectivesForMaterial,
} from "../lib/objectives";
import { materialVisibilityFilter, teacherCanManageMaterial } from "../lib/materialAccess";
import { classifyCurriculumTopic } from "../lib/ai";

const router: IRouter = Router();

/**
 * La mappa degli obiettivi di apprendimento.
 *
 * Il catalogo base e' una proposta; il dipartimento la fa sua: rinomina,
 * descrive meglio, disattiva, aggiunge. Nessuna di queste operazioni tocca
 * il catalogo condiviso con gli altri istituti.
 */

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const ListQuery = z.object({
  subject: z.string().trim().min(1).max(100).optional(),
  gradeLevel: z.string().trim().min(1).max(50).optional(),
  includeInactive: z.enum(["0", "1"]).optional(),
});

/** La mappa come la vede l'istituto, con i filtri di materia e anno. */
router.get("/institutions/:id/objectives", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = parseId(req.params.id as string);
  if (!institutionId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanAccessInstitution(req.teacher!.id, institutionId))) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }
  const query = ListQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const objectives = await effectiveObjectives([institutionId], {
    subject: query.data.subject,
    gradeLevel: query.data.gradeLevel,
    includeInactive: query.data.includeInactive === "1",
  });

  res.json({ objectives });
});

/** Materie e anni presenti nella mappa, con il conteggio delle bozze da rivedere. */
router.get("/institutions/:id/objectives/scopes", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = parseId(req.params.id as string);
  if (!institutionId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanAccessInstitution(req.teacher!.id, institutionId))) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }

  const all = await effectiveObjectives([institutionId], { includeInactive: true });
  const scopes = new Map<string, { subject: string; gradeLevel: string; total: number; active: number; toReview: number }>();
  for (const o of all) {
    const key = `${o.subject}|${o.gradeLevel}`;
    const s = scopes.get(key) ?? { subject: o.subject, gradeLevel: o.gradeLevel, total: 0, active: 0, toReview: 0 };
    s.total += 1;
    if (o.active) s.active += 1;
    if (o.active && o.reviewStatus === "bozza_da_rivedere") s.toReview += 1;
    scopes.set(key, s);
  }
  res.json({ scopes: Array.from(scopes.values()) });
});

const CreateBody = z.object({
  subject: z.string().trim().min(1).max(100),
  gradeLevel: z.string().trim().min(1).max(50),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(""),
  /** Codici degli obiettivi propedeutici, nella stessa materia. */
  requires: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

/** Un obiettivo scritto dall'istituto: nasce gia' "rivisto", lo ha scritto un docente. */
router.post("/institutions/:id/objectives", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = parseId(req.params.id as string);
  if (!institutionId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanAccessInstitution(req.teacher!.id, institutionId))) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { subject, gradeLevel, title, description, requires } = parsed.data;

  const requiredRows = requires.length
    ? await db
        .select({ id: learningObjectivesTable.id, code: learningObjectivesTable.code })
        .from(learningObjectivesTable)
        .where(
          and(
            eq(learningObjectivesTable.subject, subject),
            inArray(learningObjectivesTable.code, requires),
            sql`(${learningObjectivesTable.institutionId} IS NULL OR ${learningObjectivesTable.institutionId} = ${institutionId})`,
          ),
        )
    : [];
  if (requiredRows.length !== new Set(requires).size) {
    res.status(400).json({ error: "Uno degli obiettivi propedeutici indicati non esiste in questa materia" });
    return;
  }

  // Codice progressivo dell'istituto: IST.01, IST.02... dentro materia e anno.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningObjectivesTable)
    .where(
      and(
        eq(learningObjectivesTable.institutionId, institutionId),
        eq(learningObjectivesTable.subject, subject),
        eq(learningObjectivesTable.gradeLevel, gradeLevel),
      ),
    );
  const [{ maxOrd }] = await db
    .select({ maxOrd: sql<number>`coalesce(max(${learningObjectivesTable.ord}), 0)::int` })
    .from(learningObjectivesTable)
    .where(
      and(
        eq(learningObjectivesTable.subject, subject),
        eq(learningObjectivesTable.gradeLevel, gradeLevel),
        sql`(${learningObjectivesTable.institutionId} IS NULL OR ${learningObjectivesTable.institutionId} = ${institutionId})`,
      ),
    );

  let created;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const code = `IST.${String(count + 1 + attempt).padStart(2, "0")}`;
    try {
      [created] = await db
        .insert(learningObjectivesTable)
        .values({
          institutionId,
          subject,
          gradeLevel,
          code,
          title,
          description,
          reviewStatus: "rivisto",
          active: true,
          ord: maxOrd + 1,
          createdByTeacherId: req.teacher!.id,
        })
        .returning();
    } catch (err) {
      // Codice gia' usato (cancellazioni precedenti): prova il successivo.
      if (!(err instanceof Error && /unique/i.test(err.message))) throw err;
    }
  }
  if (!created) {
    res.status(500).json({ error: "Impossibile assegnare un codice all'obiettivo. Riprova." });
    return;
  }

  if (requiredRows.length) {
    await db
      .insert(learningObjectivePrerequisitesTable)
      .values(requiredRows.map((r) => ({ objectiveId: created!.id, requiresObjectiveId: r.id })))
      .onConflictDoNothing();
  }

  const [objective] = await effectiveObjectives([institutionId], { includeInactive: true }).then((list) =>
    list.filter((o) => o.id === created!.id),
  );
  res.status(201).json(objective);
});

const PatchBody = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  active: z.boolean().optional(),
  /** true = un docente ha letto l'obiettivo e lo conferma. */
  reviewed: z.literal(true).optional(),
  /** Solo per gli obiettivi scritti dall'istituto. */
  requires: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

/**
 * Adatta un obiettivo. Se e' del catalogo base la modifica vive in una
 * override dell'istituto; se e' dell'istituto si modifica la riga stessa.
 */
router.patch("/institutions/:id/objectives/:objectiveId", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = parseId(req.params.id as string);
  const objectiveId = parseId(req.params.objectiveId as string);
  if (!institutionId || !objectiveId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanAccessInstitution(req.teacher!.id, institutionId))) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const objective = await objectiveById(objectiveId);
  if (!objective || (objective.institutionId !== null && objective.institutionId !== institutionId)) {
    res.status(404).json({ error: "Obiettivo non trovato" });
    return;
  }
  const { title, description, active, reviewed, requires } = parsed.data;

  if (objective.institutionId === null) {
    if (requires) {
      res.status(400).json({ error: "Le propedeuticita' del catalogo base non si modificano dall'istituto" });
      return;
    }
    const now = new Date();
    await db
      .insert(institutionObjectiveOverridesTable)
      .values({
        institutionId,
        objectiveId,
        title: title ?? null,
        description: description ?? null,
        active: active ?? null,
        reviewedByTeacherId: reviewed ? req.teacher!.id : null,
        reviewedAt: reviewed ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [institutionObjectiveOverridesTable.institutionId, institutionObjectiveOverridesTable.objectiveId],
        set: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(reviewed ? { reviewedByTeacherId: req.teacher!.id, reviewedAt: now } : {}),
          updatedAt: now,
        },
      });
  } else {
    const changes: Partial<typeof learningObjectivesTable.$inferInsert> = {};
    if (title !== undefined) changes.title = title;
    if (description !== undefined) changes.description = description;
    if (active !== undefined) changes.active = active;
    if (reviewed) changes.reviewStatus = "rivisto";
    if (Object.keys(changes).length) {
      await db.update(learningObjectivesTable).set(changes).where(eq(learningObjectivesTable.id, objectiveId));
    }
    if (requires) {
      const rows = requires.length
        ? await db
            .select({ id: learningObjectivesTable.id })
            .from(learningObjectivesTable)
            .where(
              and(
                eq(learningObjectivesTable.subject, objective.subject),
                inArray(learningObjectivesTable.code, requires),
                sql`(${learningObjectivesTable.institutionId} IS NULL OR ${learningObjectivesTable.institutionId} = ${institutionId})`,
              ),
            )
        : [];
      if (rows.length !== new Set(requires).size || rows.some((r) => r.id === objectiveId)) {
        res.status(400).json({ error: "Propedeuticita' non valide" });
        return;
      }
      await db
        .delete(learningObjectivePrerequisitesTable)
        .where(eq(learningObjectivePrerequisitesTable.objectiveId, objectiveId));
      if (rows.length) {
        await db
          .insert(learningObjectivePrerequisitesTable)
          .values(rows.map((r) => ({ objectiveId, requiresObjectiveId: r.id })));
      }
    }
  }

  const [updated] = await effectiveObjectives([institutionId], { includeInactive: true }).then((list) =>
    list.filter((o) => o.id === objectiveId),
  );
  res.json(updated);
});

/** Solo gli obiettivi scritti dall'istituto si cancellano; quelli base si disattivano. */
router.delete("/institutions/:id/objectives/:objectiveId", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = parseId(req.params.id as string);
  const objectiveId = parseId(req.params.objectiveId as string);
  if (!institutionId || !objectiveId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanAccessInstitution(req.teacher!.id, institutionId))) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }
  const objective = await objectiveById(objectiveId);
  if (!objective || objective.institutionId !== institutionId) {
    res.status(404).json({ error: "Obiettivo non trovato" });
    return;
  }
  await db.delete(learningObjectivesTable).where(eq(learningObjectivesTable.id, objectiveId));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Obiettivi di un materiale
// ---------------------------------------------------------------------------

/** Gli obiettivi collegati a un materiale (docenti e studenti che lo vedono). */
router.get("/materials/:id/objectives", requireAuth, async (req, res): Promise<void> => {
  const materialId = parseId(req.params.id as string);
  if (!materialId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const visible = await materialVisibilityFilter(req);
  const [material] = visible
    ? await db
        .select({ id: materialsTable.id })
        .from(materialsTable)
        .where(and(eq(materialsTable.id, materialId), visible))
    : [];
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const rows = await db
    .select({
      id: learningObjectivesTable.id,
      code: learningObjectivesTable.code,
      title: learningObjectivesTable.title,
      subject: learningObjectivesTable.subject,
      gradeLevel: learningObjectivesTable.gradeLevel,
      source: materialObjectivesTable.source,
    })
    .from(materialObjectivesTable)
    .innerJoin(learningObjectivesTable, eq(learningObjectivesTable.id, materialObjectivesTable.objectiveId))
    .where(eq(materialObjectivesTable.materialId, materialId))
    .orderBy(learningObjectivesTable.ord, learningObjectivesTable.code);

  res.json({ objectives: rows });
});

const PutBody = z.object({ objectiveIds: z.array(z.number().int().positive()).max(12) });

/** Il docente decide quali obiettivi copre il materiale (sostituisce l'elenco). */
router.put("/materials/:id/objectives", requireTeacher, async (req, res): Promise<void> => {
  const materialId = parseId(req.params.id as string);
  if (!materialId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const parsed = PutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const wanted = Array.from(new Set(parsed.data.objectiveIds));
  const allowed = await assignableObjectiveIds(req.teacher!.id, wanted);
  if (allowed.size !== wanted.length) {
    res.status(400).json({ error: "Uno degli obiettivi non appartiene alla mappa del tuo istituto" });
    return;
  }

  await db.delete(materialObjectivesTable).where(eq(materialObjectivesTable.materialId, materialId));
  if (wanted.length) {
    await db
      .insert(materialObjectivesTable)
      .values(wanted.map((objectiveId) => ({ materialId, objectiveId, source: "docente" })));
  }
  res.json({ objectiveIds: wanted });
});

/** L'assistente propone gli obiettivi coperti: non salva nulla, decide il docente. */
router.post("/materials/:id/objectives/suggest", requireTeacher, async (req, res): Promise<void> => {
  const materialId = parseId(req.params.id as string);
  if (!materialId) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId));
  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }
  const candidates = await candidateObjectivesForMaterial(req.teacher!.id, material.subject, material.gradeLevel);
  if (!candidates.length) {
    res.json({ suggestions: [], reason: "Nessun obiettivo nella mappa per questa materia." });
    return;
  }
  try {
    const result = await classifyCurriculumTopic(
      material.title,
      material.subject,
      material.gradeLevel,
      material.content,
      candidates.map((c) => ({ code: c.code, title: c.title })),
    );
    const suggestions = candidates
      .filter((c) => result.objectiveCodes.includes(c.code))
      .map((c) => ({ id: c.id, code: c.code, title: c.title }));
    res.json({ suggestions, topic: result.topic, subtopic: result.subtopic });
  } catch (err) {
    req.log.error({ err }, "Suggerimento obiettivi fallito");
    res.status(502).json({ error: "L'assistente non e' riuscito a proporre gli obiettivi. Riprova." });
  }
});

/** Gli istituti del docente: serve al frontend per sapere quale mappa aprire. */
router.get("/me/institutions", requireTeacher, async (req, res): Promise<void> => {
  const ids = await teacherInstitutionIds(req.teacher!.id);
  res.json({ institutionIds: ids });
});

export default router;
