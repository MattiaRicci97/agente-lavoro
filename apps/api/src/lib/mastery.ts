import { eq, and, inArray, asc } from "drizzle-orm";
import {
  db,
  diagnosisItemsTable,
  masteryEventsTable,
  masteryStatesTable,
  learningObjectivesTable,
  type MasterySource,
  type MasteryOutcome,
  type MasteryState,
} from "@sillabo/db";

/**
 * Il profilo di padronanza.
 *
 * La regola sta tutta in computeMasteryState, che e' pura: prende le evidenze
 * di uno studente su un obiettivo e dice a che punto e'. Il resto del file
 * registra evidenze e ricalcola la sintesi.
 */

export interface Evidence {
  id: number;
  source: MasterySource;
  outcome: MasteryOutcome;
  at: Date;
}

/** Quante evidenze firmate recenti devono essere corrette per dire "acquisito". */
export const SIGNED_WINDOW = 2;

/**
 * - acquisito: le ultime evidenze FIRMATE (fino a SIGNED_WINDOW) sono tutte corrette;
 * - fragile: c'e' evidenza firmata non tutta corretta, ma da qualche parte lo
 *   studente ha mostrato di saperci fare almeno in parte (anche in pratica);
 * - mancante: evidenza firmata, e nessuna riuscita nemmeno parziale;
 * - null: solo pratica, nessun docente ha ancora verificato l'obiettivo.
 *
 * La pratica puo' portare da mancante a fragile, mai ad acquisito.
 */
export function computeMasteryState(events: Evidence[]): MasteryState | null {
  const signed = events
    .filter((e) => e.source === "firmato")
    .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id - a.id);
  if (!signed.length) return null;
  if (signed.slice(0, SIGNED_WINDOW).every((e) => e.outcome === "corretto")) return "acquisito";
  return events.some((e) => e.outcome !== "errato") ? "fragile" : "mancante";
}

export interface EvidenceInput {
  studentId: number;
  objectiveId: number;
  source: MasterySource;
  outcome: MasteryOutcome;
  sourceKind: string;
  sourceId: number;
}

type Pair = { studentId: number; objectiveId: number };

/** Ricalcola la sintesi per le coppie studente-obiettivo indicate. */
export async function recomputeMastery(pairs: Pair[]): Promise<void> {
  const unique = Array.from(new Map(pairs.map((p) => [`${p.studentId}|${p.objectiveId}`, p])).values());
  for (const { studentId, objectiveId } of unique) {
    const events = await db
      .select()
      .from(masteryEventsTable)
      .where(and(eq(masteryEventsTable.studentId, studentId), eq(masteryEventsTable.objectiveId, objectiveId)))
      .orderBy(asc(masteryEventsTable.createdAt));

    if (!events.length) {
      await db
        .delete(masteryStatesTable)
        .where(and(eq(masteryStatesTable.studentId, studentId), eq(masteryStatesTable.objectiveId, objectiveId)));
      continue;
    }

    const signed = events.filter((e) => e.source === "firmato");
    const practice = events.filter((e) => e.source !== "firmato");
    const values = {
      state: computeMasteryState(events.map((e) => ({ id: e.id, source: e.source, outcome: e.outcome, at: e.createdAt }))),
      signedCorrect: signed.filter((e) => e.outcome === "corretto").length,
      signedTotal: signed.length,
      practiceCorrect: practice.filter((e) => e.outcome === "corretto").length,
      practiceTotal: practice.length,
      lastSignedAt: signed.at(-1)?.createdAt ?? null,
      lastPracticeAt: practice.at(-1)?.createdAt ?? null,
      updatedAt: new Date(),
    };
    await db
      .insert(masteryStatesTable)
      .values({ studentId, objectiveId, ...values })
      .onConflictDoUpdate({ target: [masteryStatesTable.studentId, masteryStatesTable.objectiveId], set: values });
  }
}

/** Registra evidenze (di pratica o firmate) e aggiorna la sintesi. */
export async function recordEvidence(rows: EvidenceInput[]): Promise<void> {
  if (!rows.length) return;
  await db.insert(masteryEventsTable).values(rows);
  await recomputeMastery(rows);
}

/**
 * Porta nel profilo la diagnosi firmata di una correzione. Rifarlo e' sicuro:
 * le evidenze di quella correzione vengono sostituite, non sommate.
 */
export async function syncSignedEvidence(sourceKind: "scritto" | "foto", sourceId: number): Promise<void> {
  const previous = await db
    .delete(masteryEventsTable)
    .where(
      and(
        eq(masteryEventsTable.source, "firmato"),
        eq(masteryEventsTable.sourceKind, sourceKind),
        eq(masteryEventsTable.sourceId, sourceId),
      ),
    )
    .returning({ studentId: masteryEventsTable.studentId, objectiveId: masteryEventsTable.objectiveId });

  const items = await db
    .select()
    .from(diagnosisItemsTable)
    .where(
      and(
        eq(diagnosisItemsTable.sourceKind, sourceKind),
        eq(diagnosisItemsTable.sourceId, sourceId),
        eq(diagnosisItemsTable.status, "validata"),
      ),
    )
    .orderBy(asc(diagnosisItemsTable.ord));

  const rows: EvidenceInput[] = [];
  for (const item of items) {
    if (item.studentId === null || item.objectiveId === null || !item.outcome) continue;
    rows.push({
      studentId: item.studentId,
      objectiveId: item.objectiveId,
      source: "firmato",
      outcome: item.outcome,
      sourceKind,
      sourceId,
    });
  }
  if (rows.length) await db.insert(masteryEventsTable).values(rows);
  await recomputeMastery([...previous, ...rows]);
}

export interface MasteryView {
  objective: { id: number; code: string; title: string; subject: string; gradeLevel: string };
  state: MasteryState | null;
  signed: { correct: number; total: number; lastAt: Date | null };
  practice: { correct: number; total: number; lastAt: Date | null };
}

/** Il profilo di uno o piu' studenti, con gli obiettivi gia' risolti. */
export async function masteryForStudents(studentIds: number[]): Promise<Map<number, MasteryView[]>> {
  const result = new Map<number, MasteryView[]>(studentIds.map((id) => [id, []]));
  if (!studentIds.length) return result;
  const rows = await db
    .select({
      studentId: masteryStatesTable.studentId,
      state: masteryStatesTable.state,
      signedCorrect: masteryStatesTable.signedCorrect,
      signedTotal: masteryStatesTable.signedTotal,
      practiceCorrect: masteryStatesTable.practiceCorrect,
      practiceTotal: masteryStatesTable.practiceTotal,
      lastSignedAt: masteryStatesTable.lastSignedAt,
      lastPracticeAt: masteryStatesTable.lastPracticeAt,
      objectiveId: learningObjectivesTable.id,
      code: learningObjectivesTable.code,
      title: learningObjectivesTable.title,
      subject: learningObjectivesTable.subject,
      gradeLevel: learningObjectivesTable.gradeLevel,
    })
    .from(masteryStatesTable)
    .innerJoin(learningObjectivesTable, eq(learningObjectivesTable.id, masteryStatesTable.objectiveId))
    .where(inArray(masteryStatesTable.studentId, studentIds))
    .orderBy(asc(learningObjectivesTable.subject), asc(learningObjectivesTable.ord), asc(learningObjectivesTable.code));
  for (const r of rows) {
    result.get(r.studentId)?.push({
      objective: { id: r.objectiveId, code: r.code, title: r.title, subject: r.subject, gradeLevel: r.gradeLevel },
      state: r.state,
      signed: { correct: r.signedCorrect, total: r.signedTotal, lastAt: r.lastSignedAt },
      practice: { correct: r.practiceCorrect, total: r.practiceTotal, lastAt: r.lastPracticeAt },
    });
  }
  return result;
}

/** Toglie dal profilo le evidenze di correzioni che non esistono piu'. */
export async function dropEvidenceForSources(sourceKind: string, sourceIds: number[]): Promise<void> {
  if (!sourceIds.length) return;
  const removed = await db
    .delete(masteryEventsTable)
    .where(and(eq(masteryEventsTable.sourceKind, sourceKind), inArray(masteryEventsTable.sourceId, sourceIds)))
    .returning({ studentId: masteryEventsTable.studentId, objectiveId: masteryEventsTable.objectiveId });
  await recomputeMastery(removed);
}
