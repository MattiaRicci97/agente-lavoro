import { eq, and, inArray, isNull, ne, asc, sql } from "drizzle-orm";
import {
  db,
  diagnosisItemsTable,
  learningObjectivesTable,
  recoverySetsTable,
  recoverySetSourcesTable,
  recoveryQuestionsTable,
  recoveryItemsTable,
  studentNoticesTable,
  studentsTable,
  type RecoverySet,
} from "@sillabo/db";

/**
 * Il ciclo del recupero: bozza alla firma, approvazione del docente,
 * distribuzione a ciascuno secondo la propria diagnosi.
 */

export const DEFAULT_INTERVALS = [2, 7, 21];

/** Le diagnosi firmate e non riuscite, con obiettivo, di un insieme di correzioni. */
async function gapsForSources(sources: Array<{ sourceKind: string; sourceId: number }>) {
  const out: Array<{ studentId: number; objectiveId: number; errorType: string | null }> = [];
  for (const kind of ["scritto", "foto"]) {
    const ids = sources.filter((s) => s.sourceKind === kind).map((s) => s.sourceId);
    if (!ids.length) continue;
    const rows = await db
      .select({
        studentId: diagnosisItemsTable.studentId,
        objectiveId: diagnosisItemsTable.objectiveId,
        errorType: diagnosisItemsTable.errorType,
      })
      .from(diagnosisItemsTable)
      .where(
        and(
          eq(diagnosisItemsTable.sourceKind, kind),
          inArray(diagnosisItemsTable.sourceId, ids),
          eq(diagnosisItemsTable.status, "validata"),
          ne(diagnosisItemsTable.outcome, "corretto"),
        ),
      );
    for (const r of rows) {
      if (r.studentId !== null && r.objectiveId !== null) {
        out.push({ studentId: r.studentId, objectiveId: r.objectiveId, errorType: r.errorType });
      }
    }
  }
  return out;
}

/**
 * Dopo la firma di una correzione: se ha lasciato obiettivi da riprendere,
 * la aggancia alla bozza di recupero della classe (creandola se non c'e').
 * Non genera domande e non avvisa nessuno: la bozza aspetta il docente.
 */
export async function attachToRecoveryDraft(input: {
  classId: number | null;
  sourceKind: "scritto" | "foto";
  sourceId: number;
  examId: number | null;
  title: string;
}): Promise<number | null> {
  if (input.classId === null) return null;
  const gaps = await gapsForSources([{ sourceKind: input.sourceKind, sourceId: input.sourceId }]);
  if (!gaps.length) return null;

  // Gia' agganciata (firma ripetuta): niente da fare.
  const [linked] = await db
    .select({ id: recoverySetSourcesTable.recoverySetId })
    .from(recoverySetSourcesTable)
    .where(
      and(
        eq(recoverySetSourcesTable.sourceKind, input.sourceKind),
        eq(recoverySetSourcesTable.sourceId, input.sourceId),
      ),
    );
  if (linked) return linked.id;

  let [draft] = await db
    .select()
    .from(recoverySetsTable)
    .where(
      and(
        eq(recoverySetsTable.classId, input.classId),
        eq(recoverySetsTable.sourceKind, input.sourceKind),
        eq(recoverySetsTable.status, "bozza"),
        input.examId === null ? isNull(recoverySetsTable.examId) : eq(recoverySetsTable.examId, input.examId),
      ),
    );
  if (!draft) {
    [draft] = await db
      .insert(recoverySetsTable)
      .values({
        classId: input.classId,
        sourceKind: input.sourceKind,
        examId: input.examId,
        title: input.title,
        intervalsDays: DEFAULT_INTERVALS,
      })
      .returning();
  }
  await db
    .insert(recoverySetSourcesTable)
    .values({ recoverySetId: draft.id, sourceKind: input.sourceKind, sourceId: input.sourceId })
    .onConflictDoNothing();
  return draft.id;
}

export interface RecoverySetDetail {
  id: number;
  classId: number;
  title: string;
  sourceKind: string;
  status: "bozza" | "approvato";
  intervalsDays: number[];
  approvedAt: Date | null;
  createdAt: Date;
  objectives: Array<{
    id: number;
    code: string;
    title: string;
    description: string;
    studentsCount: number;
    errorTypes: Record<string, number>;
    questions: Array<{ id: number; question: string; answer: string; authorType: string }>;
  }>;
  studentsCount: number;
  progress: { done: number; total: number } | null;
}

/** Chi deve riprendere cosa, secondo le diagnosi agganciate al set. */
export async function gapsForSet(setId: number) {
  const sources = await db
    .select({ sourceKind: recoverySetSourcesTable.sourceKind, sourceId: recoverySetSourcesTable.sourceId })
    .from(recoverySetSourcesTable)
    .where(eq(recoverySetSourcesTable.recoverySetId, setId));
  return gapsForSources(sources);
}

export async function recoverySetDetail(set: RecoverySet): Promise<RecoverySetDetail> {
  const gaps = await gapsForSet(set.id);
  const objectiveIds = Array.from(new Set(gaps.map((g) => g.objectiveId)));
  const objectives = objectiveIds.length
    ? await db
        .select()
        .from(learningObjectivesTable)
        .where(inArray(learningObjectivesTable.id, objectiveIds))
        .orderBy(asc(learningObjectivesTable.ord), asc(learningObjectivesTable.code))
    : [];
  const questions = await db
    .select()
    .from(recoveryQuestionsTable)
    .where(eq(recoveryQuestionsTable.recoverySetId, set.id))
    .orderBy(asc(recoveryQuestionsTable.id));

  let progress: RecoverySetDetail["progress"] = null;
  if (set.status === "approvato") {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${recoveryItemsTable.status} = 'fatto')::int`,
      })
      .from(recoveryItemsTable)
      .where(eq(recoveryItemsTable.recoverySetId, set.id));
    progress = { done: row?.done ?? 0, total: row?.total ?? 0 };
  }

  return {
    id: set.id,
    classId: set.classId,
    title: set.title,
    sourceKind: set.sourceKind,
    status: set.status as "bozza" | "approvato",
    intervalsDays: set.intervalsDays,
    approvedAt: set.approvedAt,
    createdAt: set.createdAt,
    objectives: objectives.map((o) => {
      const mine = gaps.filter((g) => g.objectiveId === o.id);
      const errorTypes: Record<string, number> = {};
      for (const g of mine) {
        const k = g.errorType ?? "non_classificato";
        errorTypes[k] = (errorTypes[k] ?? 0) + 1;
      }
      return {
        id: o.id,
        code: o.code,
        title: o.title,
        description: o.description,
        studentsCount: new Set(mine.map((g) => g.studentId)).size,
        errorTypes,
        questions: questions
          .filter((q) => q.objectiveId === o.id)
          .map((q) => ({ id: q.id, question: q.question, answer: q.answer, authorType: q.authorType })),
      };
    }),
    studentsCount: new Set(gaps.map((g) => g.studentId)).size,
    progress,
  };
}

export function addDays(base: Date, days: number): string {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class RecoveryError extends Error {}

/**
 * L'approvazione del docente: da qui, e solo da qui, partono i richiami.
 * Ogni studente riceve soltanto gli obiettivi della PROPRIA diagnosi che hanno
 * almeno una domanda approvata, uno per intervallo.
 */
export async function approveAndDistribute(set: RecoverySet, teacherId: number, now = new Date()) {
  if (set.status !== "bozza") throw new RecoveryError("Questo recupero e' gia' stato approvato");
  const questions = await db
    .select()
    .from(recoveryQuestionsTable)
    .where(eq(recoveryQuestionsTable.recoverySetId, set.id))
    .orderBy(asc(recoveryQuestionsTable.id));
  if (!questions.length) throw new RecoveryError("Aggiungi almeno una domanda prima di approvare");
  const intervals = set.intervalsDays.length ? set.intervalsDays : DEFAULT_INTERVALS;

  const byObjective = new Map<number, typeof questions>();
  for (const q of questions) byObjective.set(q.objectiveId, [...(byObjective.get(q.objectiveId) ?? []), q]);

  const gaps = await gapsForSet(set.id);
  const pairs = Array.from(new Map(gaps.map((g) => [`${g.studentId}|${g.objectiveId}`, g])).values()).filter((g) =>
    byObjective.has(g.objectiveId),
  );

  const items = pairs.flatMap((g) => {
    const pool = byObjective.get(g.objectiveId)!;
    return intervals.map((days, i) => ({
      recoverySetId: set.id,
      studentId: g.studentId,
      objectiveId: g.objectiveId,
      // A ogni giro una domanda diversa, finche' ce ne sono.
      questionId: pool[i % pool.length].id,
      round: i + 1,
      dueDate: addDays(now, days),
    }));
  });

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(recoverySetsTable)
      .set({ status: "approvato", approvedByTeacherId: teacherId, approvedAt: now, intervalsDays: intervals })
      .where(and(eq(recoverySetsTable.id, set.id), eq(recoverySetsTable.status, "bozza")))
      .returning({ id: recoverySetsTable.id });
    if (!updated) throw new RecoveryError("Questo recupero e' gia' stato approvato");
    if (items.length) await tx.insert(recoveryItemsTable).values(items);

    // Un avviso per studente, che nomina gli obiettivi e mai un giudizio.
    const objectiveIds = Array.from(new Set(pairs.map((p) => p.objectiveId)));
    const titles = objectiveIds.length
      ? await tx
          .select({ id: learningObjectivesTable.id, title: learningObjectivesTable.title })
          .from(learningObjectivesTable)
          .where(inArray(learningObjectivesTable.id, objectiveIds))
      : [];
    const titleById = new Map(titles.map((t) => [t.id, t.title]));
    const first = new Date(`${addDays(now, intervals[0])}T00:00:00Z`).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    const studentIds = Array.from(new Set(pairs.map((p) => p.studentId)));
    if (studentIds.length) {
      await tx.insert(studentNoticesTable).values(
        studentIds.map((studentId) => {
          const mine = pairs.filter((p) => p.studentId === studentId).map((p) => titleById.get(p.objectiveId) ?? "");
          return {
            studentId,
            kind: "recupero",
            title: "Un ripasso mirato per te",
            body: `Il tuo docente ha preparato qualche richiamo veloce su: ${mine.filter(Boolean).join(", ")}. Il primo arriva il ${first}, in Ripasso lampo.`,
            link: "/studio/lampo",
          };
        }),
      );
    }
  });

  return { students: new Set(pairs.map((p) => p.studentId)).size, items: items.length };
}

/** Lo studente (riga di classe) dietro un utente, o null. */
export async function studentRowsFor(authUserId: string) {
  return db.select().from(studentsTable).where(eq(studentsTable.authUserId, authUserId));
}
