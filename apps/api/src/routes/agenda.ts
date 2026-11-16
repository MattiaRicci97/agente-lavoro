import { Router, type IRouter } from "express";
import { eq, and, inArray, gte, lte, sql } from "drizzle-orm";
import {
  db,
  materialsTable,
  materialClassesTable,
  writtenExamsTable,
  writtenExamSubmissionsTable,
  examDatesTable,
  recoveryItemsTable,
  guidedActivitiesTable,
  guidedActivitySessionsTable,
} from "@sillabo/db";
import { requireAuth } from "../middlewares/auth";
import { studentRowsFor } from "../lib/recovery";
import { EXAM_TYPE_NAMES as EXAM_TYPE } from "../lib/examTypes";
import { buildAgenda, type AgendaItem } from "../lib/agenda";

const router: IRouter = Router();


/**
 * L'agenda dello studente: compiti da consegnare, attivita' guidate aperte,
 * richiami di recupero arrivati e verifiche in calendario. Solo cose sue e
 * gia' decise dai docenti: qui non si calcola nulla sulla persona.
 */
router.get("/me/agenda", requireAuth, async (req, res): Promise<void> => {
  const students = await studentRowsFor(req.authUserId!);
  if (!students.length) {
    res.json({ items: [] });
    return;
  }
  const classIds = Array.from(new Set(students.map((s) => s.classId)));
  const studentIds = students.map((s) => s.id);
  const today = new Date().toISOString().slice(0, 10);
  const items: AgendaItem[] = [];

  // Compiti scritti assegnati e non ancora consegnati.
  const exams = await db
    .selectDistinct({
      id: writtenExamsTable.id,
      examType: writtenExamsTable.examType,
      dueDate: writtenExamsTable.dueDate,
      recoverySetId: writtenExamsTable.recoverySetId,
      materialId: materialsTable.id,
      materialTitle: materialsTable.title,
      subject: materialsTable.subject,
    })
    .from(writtenExamsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, writtenExamsTable.materialId))
    .innerJoin(materialClassesTable, eq(materialClassesTable.materialId, materialsTable.id))
    .where(and(inArray(materialClassesTable.classId, classIds), eq(writtenExamsTable.status, "assegnato")));
  if (exams.length) {
    const submitted = await db
      .select({ examId: writtenExamSubmissionsTable.examId })
      .from(writtenExamSubmissionsTable)
      .where(
        and(
          inArray(writtenExamSubmissionsTable.examId, exams.map((e) => e.id)),
          eq(writtenExamSubmissionsTable.authUserId, req.authUserId!),
        ),
      );
    const done = new Set(submitted.map((s) => s.examId));
    // Le verifiche di riscontro riguardano solo chi ha ricevuto quel recupero.
    const followupSets = Array.from(new Set(exams.map((e) => e.recoverySetId).filter((id): id is number => id !== null)));
    const mySets = followupSets.length
      ? new Set(
          (
            await db
              .selectDistinct({ setId: recoveryItemsTable.recoverySetId })
              .from(recoveryItemsTable)
              .where(and(inArray(recoveryItemsTable.recoverySetId, followupSets), inArray(recoveryItemsTable.studentId, studentIds)))
          ).map((r) => r.setId),
        )
      : new Set<number>();
    for (const e of exams) {
      if (done.has(e.id)) continue;
      if (e.recoverySetId !== null && !mySets.has(e.recoverySetId)) continue;
      items.push({
        kind: "compito",
        title: `${e.recoverySetId !== null ? "Verifica di riscontro" : (EXAM_TYPE[e.examType] ?? "Compito")}: ${e.materialTitle}`,
        subtitle: e.subject,
        dueDate: e.dueDate,
        link: `/studio/material/${e.materialId}/scritto`,
      });
    }
  }

  // Attivita' guidate non ancora completate.
  const activities = await db.select().from(guidedActivitiesTable).where(inArray(guidedActivitiesTable.classId, classIds));
  if (activities.length) {
    const completed = await db
      .select({ activityId: guidedActivitySessionsTable.activityId })
      .from(guidedActivitySessionsTable)
      .where(
        and(
          inArray(guidedActivitySessionsTable.activityId, activities.map((a) => a.id)),
          inArray(guidedActivitySessionsTable.studentId, studentIds),
          sql`${guidedActivitySessionsTable.completedAt} is not null`,
        ),
      );
    const done = new Set(completed.map((c) => c.activityId));
    for (const a of activities) {
      if (done.has(a.id)) continue;
      items.push({ kind: "attivita", title: `Attività guidata: ${a.title}`, subtitle: a.subject, dueDate: a.dueDate, link: `/studio/attivita/${a.id}` });
    }
  }

  // Richiami di recupero arrivati: una riga sola, con la data del piu' vecchio.
  const [recovery] = await db
    .select({ count: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${recoveryItemsTable.dueDate})` })
    .from(recoveryItemsTable)
    .where(
      and(inArray(recoveryItemsTable.studentId, studentIds), eq(recoveryItemsTable.status, "da_fare"), lte(recoveryItemsTable.dueDate, today)),
    );
  if (recovery && recovery.count > 0) {
    items.push({
      kind: "recupero",
      title: recovery.count === 1 ? "1 richiamo di ripasso mirato" : `${recovery.count} richiami di ripasso mirato`,
      subtitle: "Pochi minuti, preparati dal tuo docente",
      // I richiami si fanno quando arrivano: valgono come "oggi" anche se arretrati.
      dueDate: today,
      link: "/studio/lampo",
    });
  }

  // Verifiche e interrogazioni in calendario.
  const dates = await db
    .select()
    .from(examDatesTable)
    .where(and(inArray(examDatesTable.classId, classIds), gte(examDatesTable.examDate, today)));
  for (const d of dates) {
    items.push({
      kind: "verifica",
      title: d.title,
      subtitle: d.subject,
      dueDate: d.examDate,
      link: d.materialId !== null ? `/studio/material/${d.materialId}/quiz` : null,
    });
  }

  res.json({ items: buildAgenda(items, today) });
});

export default router;
