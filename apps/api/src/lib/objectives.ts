import { eq, and, or, inArray, isNull, asc } from "drizzle-orm";
import {
  db,
  classesTable,
  classTeachersTable,
  institutionMembersTable,
  learningObjectivesTable,
  learningObjectivePrerequisitesTable,
  institutionObjectiveOverridesTable,
  type LearningObjective,
  type InstitutionObjectiveOverride,
} from "@sillabo/db";

/**
 * La mappa degli obiettivi come la vede un istituto.
 *
 * Il catalogo base di Sillabo (institution_id NULL) e' uguale per tutti; ogni
 * istituto lo adatta con le proprie override e lo estende con obiettivi
 * suoi. Qui i tre pezzi vengono fusi in un'unica lista, cosi' il resto
 * dell'applicazione non deve sapere da dove arriva un obiettivo.
 */

export type ReviewStatus = "bozza_da_rivedere" | "rivisto";

export interface EffectiveObjective {
  id: number;
  code: string;
  subject: string;
  gradeLevel: string;
  title: string;
  description: string;
  active: boolean;
  reviewStatus: ReviewStatus;
  /** "sillabo" = catalogo base; "istituto" = aggiunto dall'istituto. */
  source: "sillabo" | "istituto";
  /** true se l'istituto ha modificato titolo, descrizione o attivazione. */
  customized: boolean;
  ord: number;
  /** Codici degli obiettivi propedeutici. */
  requires: string[];
  requiresIds: number[];
}

/** Gli istituti in cui il docente lavora: come membro o tramite le sue classi. */
export async function teacherInstitutionIds(teacherId: number): Promise<number[]> {
  const members = await db
    .select({ institutionId: institutionMembersTable.institutionId })
    .from(institutionMembersTable)
    .where(eq(institutionMembersTable.teacherId, teacherId));
  const viaClasses = await db
    .select({ institutionId: classesTable.institutionId })
    .from(classTeachersTable)
    .innerJoin(classesTable, eq(classesTable.id, classTeachersTable.classId))
    .where(eq(classTeachersTable.teacherId, teacherId));
  return Array.from(new Set([...members, ...viaClasses].map((r) => r.institutionId)));
}

export async function teacherCanAccessInstitution(teacherId: number, institutionId: number): Promise<boolean> {
  const ids = await teacherInstitutionIds(teacherId);
  return ids.includes(institutionId);
}

/**
 * Fusione pura (senza database) di catalogo base, obiettivi dell'istituto,
 * override e propedeuticita'. Separata per poterla testare da sola.
 */
export function mergeObjectives(input: {
  base: LearningObjective[];
  own: LearningObjective[];
  overrides: InstitutionObjectiveOverride[];
  prerequisites: Array<{ objectiveId: number; requiresObjectiveId: number }>;
}): EffectiveObjective[] {
  const overrideByObjective = new Map(input.overrides.map((o) => [o.objectiveId, o]));
  const all = [...input.base, ...input.own];
  const codeById = new Map(all.map((o) => [o.id, o.code]));

  const requiresByObjective = new Map<number, number[]>();
  for (const p of input.prerequisites) {
    const list = requiresByObjective.get(p.objectiveId) ?? [];
    list.push(p.requiresObjectiveId);
    requiresByObjective.set(p.objectiveId, list);
  }

  const result: EffectiveObjective[] = [];
  for (const o of input.base) {
    const ov = overrideByObjective.get(o.id);
    const requiresIds = requiresByObjective.get(o.id) ?? [];
    result.push({
      id: o.id,
      code: o.code,
      subject: o.subject,
      gradeLevel: o.gradeLevel,
      title: ov?.title ?? o.title,
      description: ov?.description ?? o.description,
      active: ov?.active ?? o.active,
      reviewStatus: ov?.reviewedAt ? "rivisto" : (o.reviewStatus as ReviewStatus),
      source: "sillabo",
      customized: !!ov && (ov.title !== null || ov.description !== null || ov.active !== null),
      ord: o.ord,
      requiresIds,
      requires: requiresIds.map((id) => codeById.get(id)).filter((c): c is string => !!c),
    });
  }
  for (const o of input.own) {
    const requiresIds = requiresByObjective.get(o.id) ?? [];
    result.push({
      id: o.id,
      code: o.code,
      subject: o.subject,
      gradeLevel: o.gradeLevel,
      title: o.title,
      description: o.description,
      active: o.active,
      reviewStatus: o.reviewStatus as ReviewStatus,
      source: "istituto",
      customized: false,
      ord: o.ord,
      requiresIds,
      requires: requiresIds.map((id) => codeById.get(id)).filter((c): c is string => !!c),
    });
  }

  return result.sort(
    (a, b) =>
      a.subject.localeCompare(b.subject, "it") ||
      a.gradeLevel.localeCompare(b.gradeLevel, "it") ||
      a.ord - b.ord ||
      a.code.localeCompare(b.code),
  );
}

export interface ObjectiveFilter {
  subject?: string;
  gradeLevel?: string;
  /** Di default restano solo gli obiettivi attivi. */
  includeInactive?: boolean;
}

/** La mappa effettiva di un istituto (o di piu' istituti, uniti). */
export async function effectiveObjectives(
  institutionIds: number[],
  filter: ObjectiveFilter = {},
): Promise<EffectiveObjective[]> {
  const scope = [
    filter.subject ? eq(learningObjectivesTable.subject, filter.subject) : undefined,
    filter.gradeLevel ? eq(learningObjectivesTable.gradeLevel, filter.gradeLevel) : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  const ownership = institutionIds.length
    ? or(isNull(learningObjectivesTable.institutionId), inArray(learningObjectivesTable.institutionId, institutionIds))!
    : isNull(learningObjectivesTable.institutionId);

  const rows = await db
    .select()
    .from(learningObjectivesTable)
    .where(and(ownership, ...scope))
    .orderBy(asc(learningObjectivesTable.ord), asc(learningObjectivesTable.code));

  const base = rows.filter((r) => r.institutionId === null);
  const own = rows.filter((r) => r.institutionId !== null);
  const ids = rows.map((r) => r.id);

  const overrides =
    institutionIds.length && base.length
      ? await db
          .select()
          .from(institutionObjectiveOverridesTable)
          .where(
            and(
              inArray(institutionObjectiveOverridesTable.institutionId, institutionIds),
              inArray(
                institutionObjectiveOverridesTable.objectiveId,
                base.map((b) => b.id),
              ),
            ),
          )
      : [];

  const prerequisites = ids.length
    ? await db
        .select()
        .from(learningObjectivePrerequisitesTable)
        .where(inArray(learningObjectivePrerequisitesTable.objectiveId, ids))
    : [];

  // Un prerequisito puo' stare in un altro anno (fuori dal filtro): recupera i
  // codici mancanti per non mostrare propedeuticita' vuote.
  const known = new Set(ids);
  const missing = Array.from(
    new Set(prerequisites.map((p) => p.requiresObjectiveId).filter((id) => !known.has(id))),
  );
  const extra = missing.length
    ? await db.select().from(learningObjectivesTable).where(inArray(learningObjectivesTable.id, missing))
    : [];

  const merged = mergeObjectives({ base: [...base, ...extra.filter((e) => e.institutionId === null)], own: [...own, ...extra.filter((e) => e.institutionId !== null)], overrides, prerequisites });
  const inScope = new Set(ids);
  return merged.filter((o) => inScope.has(o.id) && (filter.includeInactive || o.active));
}

/** Un singolo obiettivo con le sue informazioni di proprieta', o null. */
export async function objectiveById(id: number): Promise<LearningObjective | null> {
  const [row] = await db.select().from(learningObjectivesTable).where(eq(learningObjectivesTable.id, id));
  return row ?? null;
}

/**
 * Gli obiettivi che un docente puo' collegare a un materiale: il catalogo
 * base piu' quelli dei suoi istituti. Restituisce l'insieme degli id validi.
 */
export async function assignableObjectiveIds(teacherId: number, candidateIds: number[]): Promise<Set<number>> {
  if (!candidateIds.length) return new Set();
  const institutionIds = await teacherInstitutionIds(teacherId);
  const ownership = institutionIds.length
    ? or(isNull(learningObjectivesTable.institutionId), inArray(learningObjectivesTable.institutionId, institutionIds))!
    : isNull(learningObjectivesTable.institutionId);
  const rows = await db
    .select({ id: learningObjectivesTable.id })
    .from(learningObjectivesTable)
    .where(and(ownership, inArray(learningObjectivesTable.id, candidateIds)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Le etichette dell'anno non sono sempre scritte allo stesso modo ("1^ Superiore"
 * nel form dei materiali, "1ª Superiore" nelle classi). Qui si riportano a una
 * forma sola, cosi' il confronto con la mappa non fallisce per un carattere.
 */
export function normalizeGradeLevel(label: string): string {
  return label
    .trim()
    .replace(/\^/g, "\u00aa")
    .replace(/\s+/g, " ")
    .replace(/^(\d)\s*(superiore|media)$/i, (_m, n, kind) => `${n}\u00aa ${kind[0].toUpperCase()}${kind.slice(1).toLowerCase()}`);
}

/**
 * Gli obiettivi tra cui l'assistente puo' scegliere per un materiale: quelli
 * attivi della stessa materia nell'anno indicato; se per quell'anno non c'e'
 * nulla, tutti quelli della materia (il materiale puo' coprire piu' anni).
 */
export async function candidateObjectivesForMaterial(
  teacherId: number,
  subject: string,
  gradeLevel: string,
): Promise<EffectiveObjective[]> {
  const institutionIds = await teacherInstitutionIds(teacherId);
  const all = await effectiveObjectives(institutionIds, {});
  const wantedSubject = subject.trim().toLowerCase();
  const wantedGrade = normalizeGradeLevel(gradeLevel);
  const sameSubject = all.filter((o) => o.subject.trim().toLowerCase() === wantedSubject);
  const sameGrade = sameSubject.filter((o) => normalizeGradeLevel(o.gradeLevel) === wantedGrade);
  return sameGrade.length ? sameGrade : sameSubject;
}
