import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  masteryEventsTable,
  recoveryItemsTable,
  recoverySetSourcesTable,
  studentsTable,
  writtenExamSubmissionsTable,
  type RecoverySet,
} from "@sillabo/db";

/**
 * Le metriche di efficacia del recupero: numeri aggregati per set, classe e
 * istituto. Servono a capire se lo strumento funziona nei progetti pilota,
 * non a valutare le persone: qui non compare mai uno studente.
 */
export interface SetMetrics {
  setId: number;
  classId: number;
  title: string;
  approvedAt: Date | null;
  followupAssigned: boolean;
  students: number;
  /** Coppie studente-obiettivo mandate a recupero. */
  gaps: number;
  /** Di queste, quante sono state verificate nel riscontro firmato. */
  gapsAssessed: number;
  /** ...e quante sono risultate corrette. */
  gapsRecovered: number;
  recoveredPercent: number | null;
  /** Giorni medi dall'approvazione al riscontro riuscito. */
  avgRecoveryDays: number | null;
  /** Voto medio firmato, solo per chi ha svolto entrambe le prove. */
  initialGrade: number | null;
  followupGrade: number | null;
  gradeDelta: number | null;
  gradedBoth: number;
  /** Richiami gia' dovuti e quanti sono stati svolti. */
  itemsDue: number;
  itemsDone: number;
  participationPercent: number | null;
  studentsActive: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 100) : null);

export async function metricsForSet(set: RecoverySet, today = new Date().toISOString().slice(0, 10)): Promise<SetMetrics> {
  const items = await db.select().from(recoveryItemsTable).where(eq(recoveryItemsTable.recoverySetId, set.id));
  const pairs = new Set(items.map((i) => `${i.studentId}|${i.objectiveId}`));
  const studentIds = Array.from(new Set(items.map((i) => i.studentId)));
  const due = items.filter((i) => i.dueDate <= today);
  const done = due.filter((i) => i.status === "fatto");

  const students = studentIds.length
    ? await db
        .select({ id: studentsTable.id, authUserId: studentsTable.authUserId })
        .from(studentsTable)
        .where(inArray(studentsTable.id, studentIds))
    : [];
  const authIds = students.map((s) => s.authUserId).filter((x): x is string => !!x);

  // Riscontro: evidenze firmate che vengono dalle consegne della verifica di riscontro.
  const followupSubs =
    set.followupExamId !== null && authIds.length
      ? await db
          .select()
          .from(writtenExamSubmissionsTable)
          .where(
            and(
              eq(writtenExamSubmissionsTable.examId, set.followupExamId),
              eq(writtenExamSubmissionsTable.validationStatus, "validata"),
              inArray(writtenExamSubmissionsTable.authUserId, authIds),
            ),
          )
      : [];
  const events = followupSubs.length
    ? await db
        .select()
        .from(masteryEventsTable)
        .where(
          and(
            eq(masteryEventsTable.source, "firmato"),
            eq(masteryEventsTable.sourceKind, "scritto"),
            inArray(masteryEventsTable.sourceId, followupSubs.map((s) => s.id)),
          ),
        )
    : [];
  const byPair = new Map<string, typeof events>();
  for (const e of events) {
    const key = `${e.studentId}|${e.objectiveId}`;
    if (pairs.has(key)) byPair.set(key, [...(byPair.get(key) ?? []), e]);
  }
  const recovered = Array.from(byPair.values()).filter((evs) => evs.every((e) => e.outcome === "corretto"));
  const days = set.approvedAt
    ? recovered.map((evs) => (Math.max(...evs.map((e) => e.createdAt.getTime())) - set.approvedAt!.getTime()) / 86400000)
    : [];

  // Voto iniziale e di riscontro, solo per chi li ha entrambi firmati.
  const sources = await db
    .select({ sourceId: recoverySetSourcesTable.sourceId })
    .from(recoverySetSourcesTable)
    .where(and(eq(recoverySetSourcesTable.recoverySetId, set.id), eq(recoverySetSourcesTable.sourceKind, "scritto")));
  const initialSubs =
    sources.length && followupSubs.length
      ? await db
          .select()
          .from(writtenExamSubmissionsTable)
          .where(inArray(writtenExamSubmissionsTable.id, sources.map((s) => s.sourceId)))
      : [];
  const initialByUser = new Map(initialSubs.filter((s) => s.teacherGrade !== null).map((s) => [s.authUserId, s.teacherGrade!]));
  const both = followupSubs
    .filter((s) => s.teacherGrade !== null && initialByUser.has(s.authUserId))
    .map((s) => ({ initial: initialByUser.get(s.authUserId)!, followup: s.teacherGrade! }));
  const initialGrade = avg(both.map((b) => b.initial));
  const followupGrade = avg(both.map((b) => b.followup));
  const avgDays = avg(days);

  return {
    setId: set.id,
    classId: set.classId,
    title: set.title,
    approvedAt: set.approvedAt,
    followupAssigned: set.followupExamId !== null,
    students: studentIds.length,
    gaps: pairs.size,
    gapsAssessed: byPair.size,
    gapsRecovered: recovered.length,
    recoveredPercent: pct(recovered.length, byPair.size),
    avgRecoveryDays: avgDays === null ? null : round1(avgDays),
    initialGrade: initialGrade === null ? null : round1(initialGrade),
    followupGrade: followupGrade === null ? null : round1(followupGrade),
    gradeDelta: initialGrade === null || followupGrade === null ? null : round1(followupGrade - initialGrade),
    gradedBoth: both.length,
    itemsDue: due.length,
    itemsDone: done.length,
    participationPercent: pct(done.length, due.length),
    studentsActive: new Set(items.filter((i) => i.status === "fatto").map((i) => i.studentId)).size,
  };
}

export interface MetricsTotals {
  sets: number;
  students: number;
  gaps: number;
  gapsAssessed: number;
  gapsRecovered: number;
  recoveredPercent: number | null;
  avgRecoveryDays: number | null;
  gradeDelta: number | null;
  itemsDue: number;
  itemsDone: number;
  participationPercent: number | null;
}

/** Somma i set pesando le medie per il numero di casi che le sostengono. */
export function totalsOf(rows: SetMetrics[]): MetricsTotals {
  const sum = (f: (r: SetMetrics) => number) => rows.reduce((a, r) => a + f(r), 0);
  const weighted = (value: (r: SetMetrics) => number | null, weight: (r: SetMetrics) => number) => {
    const valid = rows.filter((r) => value(r) !== null && weight(r) > 0);
    const w = valid.reduce((a, r) => a + weight(r), 0);
    return w ? round1(valid.reduce((a, r) => a + value(r)! * weight(r), 0) / w) : null;
  };
  return {
    sets: rows.length,
    students: sum((r) => r.students),
    gaps: sum((r) => r.gaps),
    gapsAssessed: sum((r) => r.gapsAssessed),
    gapsRecovered: sum((r) => r.gapsRecovered),
    recoveredPercent: pct(sum((r) => r.gapsRecovered), sum((r) => r.gapsAssessed)),
    avgRecoveryDays: weighted((r) => r.avgRecoveryDays, (r) => r.gapsRecovered),
    gradeDelta: weighted((r) => r.gradeDelta, (r) => r.gradedBoth),
    itemsDue: sum((r) => r.itemsDue),
    itemsDone: sum((r) => r.itemsDone),
    participationPercent: pct(sum((r) => r.itemsDone), sum((r) => r.itemsDue)),
  };
}
