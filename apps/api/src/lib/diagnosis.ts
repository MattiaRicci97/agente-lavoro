import { eq, and, inArray, asc } from "drizzle-orm";
import {
  db,
  classesTable,
  studentsTable,
  diagnosisItemsTable,
  learningObjectivesTable,
  materialObjectivesTable,
  type DiagnosisOutcome,
  type DiagnosisErrorType,
} from "@sillabo/db";
import type { DiagnosedExercise, ObjectiveCandidate } from "./ai";
import { effectiveObjectives, normalizeGradeLevel, assignableObjectiveIds, type EffectiveObjective } from "./objectives";

/**
 * La diagnosi che accompagna una correzione.
 *
 * Qui stanno le tre operazioni che i flussi di correzione condividono:
 * trovare gli obiettivi candidati per il lavoro di uno studente, salvare la
 * proposta del modello, e registrare la decisione del docente. Nessuna di
 * queste tocca il voto: la diagnosi viaggia accanto, con lo stesso stato.
 */

export type SourceKind = "scritto" | "foto";

export interface DiagnosisView {
  id: number;
  exercise: string;
  /** Proposta dell'assistente. */
  ai: {
    objective: { id: number; code: string; title: string } | null;
    outcome: DiagnosisOutcome;
    errorType: DiagnosisErrorType | null;
    evidence: string;
  };
  /** Decisione del docente (null finche' non firma). */
  teacher: {
    objective: { id: number; code: string; title: string } | null;
    outcome: DiagnosisOutcome;
    errorType: DiagnosisErrorType | null;
  } | null;
  status: "da_validare" | "validata" | "scartata";
}

/** Gli obiettivi candidati per il lavoro di uno studente di una certa classe. */
export async function candidateObjectivesForStudentWork(input: {
  classId: number | null;
  subject: string;
  gradeLevel: string;
  materialId?: number | null;
  /** Obiettivi da mettere in testa (es. quelli di una verifica di riscontro). */
  priorityObjectiveIds?: number[];
}): Promise<EffectiveObjective[]> {
  if (input.classId === null) return [];
  const [cls] = await db
    .select({ institutionId: classesTable.institutionId, gradeLevel: classesTable.gradeLevel })
    .from(classesTable)
    .where(eq(classesTable.id, input.classId));
  if (!cls) return [];

  const all = await effectiveObjectives([cls.institutionId], {});
  const wantedSubject = input.subject.trim().toLowerCase();
  const sameSubject = all.filter((o) => o.subject.trim().toLowerCase() === wantedSubject);
  // L'anno della classe e' piu' affidabile di quello scritto sul materiale.
  const grades = new Set([normalizeGradeLevel(cls.gradeLevel), normalizeGradeLevel(input.gradeLevel)]);
  const sameGrade = sameSubject.filter((o) => grades.has(normalizeGradeLevel(o.gradeLevel)));
  const pool = sameGrade.length ? sameGrade : sameSubject;

  if (input.priorityObjectiveIds?.length) {
    const wanted = new Set(input.priorityObjectiveIds);
    const byId = new Map(all.map((o) => [o.id, o]));
    const first = input.priorityObjectiveIds.map((id) => byId.get(id)).filter((o): o is EffectiveObjective => !!o);
    return [...first, ...pool.filter((o) => !wanted.has(o.id))];
  }

  // Gli obiettivi dichiarati sul materiale vanno in testa: sono quelli che il
  // docente si aspetta di vedere in questa verifica.
  if (input.materialId) {
    const linked = await db
      .select({ objectiveId: materialObjectivesTable.objectiveId })
      .from(materialObjectivesTable)
      .where(eq(materialObjectivesTable.materialId, input.materialId));
    const linkedIds = new Set(linked.map((l) => l.objectiveId));
    if (linkedIds.size) {
      const byId = new Map(all.map((o) => [o.id, o]));
      const first = Array.from(linkedIds).map((id) => byId.get(id)).filter((o): o is EffectiveObjective => !!o);
      return [...first, ...pool.filter((o) => !linkedIds.has(o.id))];
    }
  }
  return pool;
}

export function toCandidates(objectives: EffectiveObjective[]): ObjectiveCandidate[] {
  return objectives.map((o) => ({ code: o.code, title: o.title }));
}

/** Salva la proposta del modello per una correzione appena creata. */
export async function storeDiagnosis(input: {
  sourceKind: SourceKind;
  sourceId: number;
  authUserId: string;
  classId: number | null;
  items: DiagnosedExercise[];
  candidates: EffectiveObjective[];
}): Promise<number> {
  if (!input.items.length) return 0;
  const idByCode = new Map(input.candidates.map((c) => [c.code, c.id]));
  const [student] = input.classId !== null
    ? await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.authUserId, input.authUserId), eq(studentsTable.classId, input.classId)))
    : [];

  await db.insert(diagnosisItemsTable).values(
    input.items.map((item, ord) => ({
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      studentId: student?.id ?? null,
      authUserId: input.authUserId,
      classId: input.classId,
      exerciseLabel: item.exercise,
      ord,
      aiObjectiveId: item.objectiveCode ? (idByCode.get(item.objectiveCode) ?? null) : null,
      aiOutcome: item.outcome,
      aiErrorType: item.errorType,
      aiEvidence: item.evidence,
    })),
  );
  return input.items.length;
}

/**
 * Le diagnosi di un insieme di correzioni, con gli obiettivi gia' risolti.
 * `onlyValidated` e' la vista dello studente: prima della firma non vede nulla,
 * e le righe scartate dal docente non esistono per lui.
 */
export async function diagnosisForSources(
  sourceKind: SourceKind,
  sourceIds: number[],
  opts: { onlyValidated?: boolean } = {},
): Promise<Map<number, DiagnosisView[]>> {
  const result = new Map<number, DiagnosisView[]>(sourceIds.map((id) => [id, []]));
  if (!sourceIds.length) return result;

  const rows = await db
    .select()
    .from(diagnosisItemsTable)
    .where(
      and(
        eq(diagnosisItemsTable.sourceKind, sourceKind),
        inArray(diagnosisItemsTable.sourceId, sourceIds),
        ...(opts.onlyValidated ? [eq(diagnosisItemsTable.status, "validata")] : []),
      ),
    )
    .orderBy(asc(diagnosisItemsTable.ord), asc(diagnosisItemsTable.id));
  if (!rows.length) return result;

  const objectiveIds = Array.from(
    new Set(rows.flatMap((r) => [r.aiObjectiveId, r.objectiveId]).filter((id): id is number => id !== null)),
  );
  const objectives = objectiveIds.length
    ? await db
        .select({ id: learningObjectivesTable.id, code: learningObjectivesTable.code, title: learningObjectivesTable.title })
        .from(learningObjectivesTable)
        .where(inArray(learningObjectivesTable.id, objectiveIds))
    : [];
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const resolve = (id: number | null) => (id !== null ? (byId.get(id) ?? null) : null);

  for (const r of rows) {
    result.get(r.sourceId)?.push({
      id: r.id,
      exercise: r.exerciseLabel,
      ai: {
        objective: resolve(r.aiObjectiveId),
        outcome: r.aiOutcome,
        errorType: r.aiErrorType,
        evidence: r.aiEvidence,
      },
      teacher:
        r.status === "validata" && r.outcome
          ? { objective: resolve(r.objectiveId), outcome: r.outcome, errorType: r.errorType }
          : null,
      status: r.status as DiagnosisView["status"],
    });
  }
  return result;
}

export interface DiagnosisDecision {
  id: number;
  objectiveId?: number | null;
  outcome?: DiagnosisOutcome;
  errorType?: DiagnosisErrorType | null;
  discard?: boolean;
}

/**
 * La firma del docente sulla diagnosi: le righe che non nomina vengono
 * confermate come proposte, quelle che corregge prendono i suoi valori, quelle
 * che scarta spariscono dal profilo dello studente. Tutte lasciano "da_validare".
 */
export async function validateDiagnosis(input: {
  sourceKind: SourceKind;
  sourceId: number;
  teacherId: number;
  decisions: DiagnosisDecision[];
}): Promise<{ validated: number; discarded: number }> {
  const rows = await db
    .select()
    .from(diagnosisItemsTable)
    .where(and(eq(diagnosisItemsTable.sourceKind, input.sourceKind), eq(diagnosisItemsTable.sourceId, input.sourceId)));
  if (!rows.length) return { validated: 0, discarded: 0 };

  const decisionById = new Map(input.decisions.map((d) => [d.id, d]));
  const wantedObjectiveIds = Array.from(
    new Set(
      input.decisions
        .map((d) => d.objectiveId)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  const allowed = await assignableObjectiveIds(input.teacherId, wantedObjectiveIds);
  for (const id of wantedObjectiveIds) {
    if (!allowed.has(id)) throw new DiagnosisError("Uno degli obiettivi scelti non appartiene alla mappa del tuo istituto");
  }

  const now = new Date();
  let validated = 0;
  let discarded = 0;
  for (const row of rows) {
    const d = decisionById.get(row.id);
    if (d?.discard) {
      await db
        .update(diagnosisItemsTable)
        .set({ status: "scartata", validatedByTeacherId: input.teacherId, validatedAt: now })
        .where(eq(diagnosisItemsTable.id, row.id));
      discarded += 1;
      continue;
    }
    const outcome = d?.outcome ?? row.aiOutcome;
    const objectiveId = d && "objectiveId" in d ? (d.objectiveId ?? null) : row.aiObjectiveId;
    let errorType = d && "errorType" in d ? (d.errorType ?? null) : row.aiErrorType;
    if (outcome === "corretto") errorType = null;
    else if (errorType === null) errorType = "non_classificato";

    await db
      .update(diagnosisItemsTable)
      .set({
        status: "validata",
        objectiveId,
        outcome,
        errorType,
        validatedByTeacherId: input.teacherId,
        validatedAt: now,
      })
      .where(eq(diagnosisItemsTable.id, row.id));
    validated += 1;
  }
  return { validated, discarded };
}

export class DiagnosisError extends Error {}

/** Cancella le diagnosi legate a correzioni che non esistono piu'. */
export async function deleteDiagnosisForSources(sourceKind: SourceKind, sourceIds: number[]): Promise<void> {
  if (!sourceIds.length) return;
  await db
    .delete(diagnosisItemsTable)
    .where(and(eq(diagnosisItemsTable.sourceKind, sourceKind), inArray(diagnosisItemsTable.sourceId, sourceIds)));
}
