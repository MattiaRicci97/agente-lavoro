import { Router, type IRouter } from "express";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import {
  db,
  classesTable,
  classTeachersTable,
  studentsTable,
  materialClassesTable,
  materialViewsTable,
  writtenExamsTable,
  writtenExamSubmissionsTable,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { teacherCanManageMaterial } from "../lib/materialAccess";
import { recoveryRecipientIds } from "../lib/recovery";
import { EXAM_TYPE_NAMES } from "../lib/examTypes";

const router: IRouter = Router();

/**
 * Segnali di partecipazione su un materiale, per il docente: chi non l'ha
 * ancora aperto e chi non ha consegnato i compiti assegnati. Sono fatti, non
 * giudizi: nessun punteggio, nessuna previsione. Riguardano solo le classi
 * in cui il docente insegna.
 */
router.get("/materials/:id/participation", requireTeacher, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  if (!Number.isInteger(materialId) || !(await teacherCanManageMaterial(req.teacher!.id, materialId))) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const classes = await db
    .select({ id: classesTable.id, name: classesTable.name })
    .from(materialClassesTable)
    .innerJoin(classesTable, eq(classesTable.id, materialClassesTable.classId))
    .innerJoin(classTeachersTable, eq(classTeachersTable.classId, classesTable.id))
    .where(and(eq(materialClassesTable.materialId, materialId), eq(classTeachersTable.teacherId, req.teacher!.id)))
    .orderBy(asc(classesTable.name));
  if (!classes.length) {
    res.json({ classes: [], assignments: [] });
    return;
  }
  const classIds = classes.map((c) => c.id);
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const students = await db
    .select({ id: studentsTable.id, name: studentsTable.name, classId: studentsTable.classId, authUserId: studentsTable.authUserId })
    .from(studentsTable)
    .where(inArray(studentsTable.classId, classIds))
    .orderBy(asc(studentsTable.name));

  const views = students.length
    ? await db
        .select({ studentId: materialViewsTable.studentId })
        .from(materialViewsTable)
        .where(and(eq(materialViewsTable.materialId, materialId), inArray(materialViewsTable.studentId, students.map((s) => s.id))))
    : [];
  const opened = new Set(views.map((v) => v.studentId));

  const exams = await db
    .select()
    .from(writtenExamsTable)
    .where(eq(writtenExamsTable.materialId, materialId))
    .orderBy(desc(writtenExamsTable.createdAt));
  const submissions = exams.length
    ? await db
        .select({ examId: writtenExamSubmissionsTable.examId, authUserId: writtenExamSubmissionsTable.authUserId })
        .from(writtenExamSubmissionsTable)
        .where(inArray(writtenExamSubmissionsTable.examId, exams.map((e) => e.id)))
    : [];

  const assignments = [];
  for (const exam of exams) {
    // Una verifica di riscontro riguarda solo chi ha ricevuto quel recupero.
    const recipients = exam.recoverySetId !== null ? new Set(await recoveryRecipientIds(exam.recoverySetId)) : null;
    const expected = recipients ? students.filter((s) => recipients.has(s.id)) : students;
    const done = new Set(submissions.filter((s) => s.examId === exam.id).map((s) => s.authUserId));
    // Chi non ha ancora un account non puo' consegnare: non e' "mancante", e' "non iscritto".
    const missing = expected.filter((s) => s.authUserId && !done.has(s.authUserId));
    assignments.push({
      id: exam.id,
      label: exam.recoverySetId !== null ? "Verifica di riscontro" : (EXAM_TYPE_NAMES[exam.examType] ?? "Compito"),
      dueDate: exam.dueDate,
      expected: expected.filter((s) => s.authUserId).length,
      submitted: expected.filter((s) => s.authUserId && done.has(s.authUserId)).length,
      missing: missing.map((s) => ({ name: s.name, className: className.get(s.classId) ?? "" })),
    });
  }

  res.json({
    classes: classes.map((c) => {
      const mine = students.filter((s) => s.classId === c.id);
      return {
        id: c.id,
        name: c.name,
        total: mine.length,
        opened: mine.filter((s) => opened.has(s.id)).length,
        notOpened: mine.filter((s) => !opened.has(s.id)).map((s) => s.name),
      };
    }),
    assignments,
  });
});

export default router;
