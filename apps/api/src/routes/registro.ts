import { Router, type IRouter } from "express";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  studentNotesTable,
  materialsTable,
  photoCorrectionsTable,
  oralSessionsTable,
  writtenExamsTable,
  writtenExamSubmissionsTable,
  quizAttemptsTable,
  classTeachersTable,
  teachersTable,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const NoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

/**
 * Il registro del docente.
 *
 * Raccoglie in un posto solo le valutazioni che il docente ha firmato, sparse
 * fra compiti fotografati, interrogazioni ed elaborati scritti.
 *
 * Regola non negoziabile: nel registro entrano SOLO i voti validati dal
 * docente. Le proposte dell'assistente non fanno media, non compaiono nella
 * pagella e non finiscono nell'esportazione: finche' non c'e' la firma, per
 * il registro quel voto non esiste.
 *
 * I quiz restano fuori dai voti: sono esercitazione autonoma dello studente,
 * non una prova. Vengono mostrati a parte, come indicazione di impegno.
 */

/** La classe dev'essere del docente che chiede. */
async function ownedClass(teacherId: number, classId: number) {
  const [cls] = await db
    .select({
      id: classesTable.id,
      name: classesTable.name,
      gradeLevel: classesTable.gradeLevel,
    })
    .from(classesTable)
    .innerJoin(classTeachersTable, eq(classTeachersTable.classId, classesTable.id))
    .where(and(eq(classesTable.id, classId), eq(classTeachersTable.teacherId, teacherId)));
  return cls ?? null;
}

/** Lo studente dev'essere in una classe del docente. */
async function ownedStudent(teacherId: number, studentId: number) {
  const [row] = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      besDsa: studentsTable.besDsa,
      authUserId: studentsTable.authUserId,
      classId: studentsTable.classId,
      className: classesTable.name,
      gradeLevel: classesTable.gradeLevel,
    })
    .from(studentsTable)
    .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
    .innerJoin(classTeachersTable, eq(classTeachersTable.classId, classesTable.id))
    .where(and(eq(studentsTable.id, studentId), eq(classTeachersTable.teacherId, teacherId)));
  return row ?? null;
}

export interface RegistroEntry {
  kind: "compito" | "interrogazione" | "elaborato";
  id: number;
  date: string;
  subject: string;
  title: string;
  grade: number | null;
  feedback: string | null;
  /** Chi ha firmato: nel consiglio di classe i voti sono di piu' colleghi. */
  signedBy: string | null;
}

/**
 * Le prove firmate di uno studente, in ordine di data.
 * Le tabelle storiche identificano lo studente per nome: dove c'e' l'utente
 * si usa quello, altrimenti si ricade sul nome dentro la sua classe.
 */
async function signedEntries(student: {
  id: number;
  name: string;
  authUserId: string | null;
  classId: number;
}): Promise<RegistroEntry[]> {
  const byUserOrName = (userCol: any, nameCol: any, classCol: any) =>
    student.authUserId
      ? or(eq(userCol, student.authUserId), and(eq(nameCol, student.name), eq(classCol, student.classId)))!
      : and(eq(nameCol, student.name), eq(classCol, student.classId))!;

  const photos = await db
    .select({
      id: photoCorrectionsTable.id,
      date: photoCorrectionsTable.validatedAt,
      created: photoCorrectionsTable.createdAt,
      subject: photoCorrectionsTable.subject,
      title: photoCorrectionsTable.assignmentPrompt,
      grade: photoCorrectionsTable.teacherGrade,
      feedback: photoCorrectionsTable.teacherFeedback,
      signedBy: teachersTable.name,
    })
    .from(photoCorrectionsTable)
    .leftJoin(teachersTable, eq(teachersTable.id, photoCorrectionsTable.validatedByTeacherId))
    .where(
      and(
        eq(photoCorrectionsTable.validationStatus, "validata"),
        byUserOrName(
          photoCorrectionsTable.authUserId,
          photoCorrectionsTable.studentName,
          photoCorrectionsTable.classId,
        ),
      ),
    );

  const orals = await db
    .select({
      id: oralSessionsTable.id,
      date: oralSessionsTable.validatedAt,
      created: oralSessionsTable.createdAt,
      subject: materialsTable.subject,
      title: materialsTable.title,
      grade: oralSessionsTable.teacherGrade,
      feedback: oralSessionsTable.teacherFeedback,
      signedBy: teachersTable.name,
    })
    .from(oralSessionsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, oralSessionsTable.materialId))
    .leftJoin(teachersTable, eq(teachersTable.id, oralSessionsTable.validatedByTeacherId))
    .where(
      and(
        eq(oralSessionsTable.validationStatus, "validata"),
        byUserOrName(oralSessionsTable.authUserId, oralSessionsTable.studentName, oralSessionsTable.classId),
      ),
    );

  const writtens = await db
    .select({
      id: writtenExamSubmissionsTable.id,
      date: writtenExamSubmissionsTable.validatedAt,
      created: writtenExamSubmissionsTable.createdAt,
      subject: materialsTable.subject,
      title: materialsTable.title,
      examType: writtenExamsTable.examType,
      grade: writtenExamSubmissionsTable.teacherGrade,
      feedback: writtenExamSubmissionsTable.teacherFeedback,
      signedBy: teachersTable.name,
    })
    .from(writtenExamSubmissionsTable)
    .leftJoin(teachersTable, eq(teachersTable.id, writtenExamSubmissionsTable.validatedByTeacherId))
    .innerJoin(writtenExamsTable, eq(writtenExamsTable.id, writtenExamSubmissionsTable.examId))
    .innerJoin(materialsTable, eq(materialsTable.id, writtenExamsTable.materialId))
    .where(
      and(
        eq(writtenExamSubmissionsTable.validationStatus, "validata"),
        byUserOrName(
          writtenExamSubmissionsTable.authUserId,
          writtenExamSubmissionsTable.studentName,
          writtenExamSubmissionsTable.classId,
        ),
      ),
    );

  const iso = (d: Date | null, fallback: Date) => (d ?? fallback).toISOString();

  const entries: RegistroEntry[] = [
    ...photos.map((p) => ({
      kind: "compito" as const,
      id: p.id,
      date: iso(p.date, p.created),
      subject: p.subject,
      title: p.title?.slice(0, 120) || "Compito fotografato",
      grade: p.grade,
      feedback: p.feedback,
      signedBy: p.signedBy,
    })),
    ...orals.map((o) => ({
      kind: "interrogazione" as const,
      id: o.id,
      date: iso(o.date, o.created),
      subject: o.subject,
      title: o.title,
      grade: o.grade,
      feedback: o.feedback,
      signedBy: o.signedBy,
    })),
    ...writtens.map((w) => ({
      kind: "elaborato" as const,
      id: w.id,
      date: iso(w.date, w.created),
      subject: w.subject,
      title: `${w.examType} — ${w.title}`,
      grade: w.grade,
      feedback: w.feedback,
      signedBy: w.signedBy,
    })),
  ];

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** Media dei voti firmati, arrotondata a un decimale. */
function average(entries: RegistroEntry[]): number | null {
  const graded = entries.filter((e) => e.grade !== null);
  if (!graded.length) return null;
  return Math.round((graded.reduce((s, e) => s + (e.grade ?? 0), 0) / graded.length) * 10) / 10;
}

/** Il registro di una classe: una riga per studente. */
router.get("/classes/:id/registro", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const cls = await ownedClass(req.teacher!.id, classId);
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const roster = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.classId, classId))
    .orderBy(studentsTable.name);

  const rows = [];
  for (const s of roster) {
    const entries = await signedEntries(s);
    rows.push({
      studentId: s.id,
      name: s.name,
      besDsa: s.besDsa,
      average: average(entries),
      gradesCount: entries.filter((e) => e.grade !== null).length,
      lastDate: entries[0]?.date ?? null,
    });
  }

  res.json({
    class: { id: cls.id, name: cls.name, gradeLevel: cls.gradeLevel },
    students: rows,
  });
});

/** Il quadro completo di uno studente. */
router.get("/students/:id/registro", requireTeacher, async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const student = await ownedStudent(req.teacher!.id, studentId);
  if (!student) {
    res.status(404).json({ error: "Studente non trovato" });
    return;
  }

  const entries = await signedEntries(student);

  // I quiz sono esercitazione, non valutazione: restano contati a parte.
  const attempts = await db
    .select({
      id: quizAttemptsTable.id,
      score: quizAttemptsTable.score,
      total: quizAttemptsTable.total,
      createdAt: quizAttemptsTable.createdAt,
    })
    .from(quizAttemptsTable)
    .where(
      student.authUserId
        ? or(
            eq(quizAttemptsTable.authUserId, student.authUserId),
            and(
              eq(quizAttemptsTable.studentName, student.name),
              eq(quizAttemptsTable.classId, student.classId),
            ),
          )
        : and(
            eq(quizAttemptsTable.studentName, student.name),
            eq(quizAttemptsTable.classId, student.classId),
          ),
    )
    .orderBy(desc(quizAttemptsTable.createdAt))
    .limit(50);

  const answered = attempts.reduce((s, a) => s + a.total, 0);
  const correct = attempts.reduce((s, a) => s + a.score, 0);

  const notes = await db
    .select()
    .from(studentNotesTable)
    .where(
      and(eq(studentNotesTable.studentId, studentId), eq(studentNotesTable.teacherId, req.teacher!.id)),
    )
    .orderBy(desc(studentNotesTable.createdAt));

  res.json({
    student: {
      id: student.id,
      name: student.name,
      besDsa: student.besDsa,
      className: student.className,
      gradeLevel: student.gradeLevel,
    },
    average: average(entries),
    entries,
    practice: {
      attempts: attempts.length,
      accuracyPercent: answered ? Math.round((correct / answered) * 1000) / 10 : null,
      lastAt: attempts[0]?.createdAt ?? null,
    },
    notes,
  });
});

/** Osservazione privata del docente su uno studente. */
router.post("/students/:id/notes", requireTeacher, async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = NoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await ownedStudent(req.teacher!.id, studentId))) {
    res.status(404).json({ error: "Studente non trovato" });
    return;
  }

  const [created] = await db
    .insert(studentNotesTable)
    .values({ studentId, teacherId: req.teacher!.id, body: parsed.data.body })
    .returning();

  res.status(201).json(created);
});

router.delete("/student-notes/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  // Ognuno cancella solo le proprie osservazioni.
  const [note] = await db
    .select()
    .from(studentNotesTable)
    .where(and(eq(studentNotesTable.id, id), eq(studentNotesTable.teacherId, req.teacher!.id)));
  if (!note) {
    res.status(404).json({ error: "Nota non trovata" });
    return;
  }

  await db.delete(studentNotesTable).where(eq(studentNotesTable.id, id));
  res.status(204).end();
});

/** Cella CSV: virgolette raddoppiate, campo sempre quotato. */
function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Esportazione per il registro elettronico della scuola.
 *
 * Il punto e' non far ricopiare a mano voti che il docente ha gia' dato:
 * una riga per prova, con data, studente, tipo, materia e voto.
 */
router.get("/classes/:id/registro/export", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const cls = await ownedClass(req.teacher!.id, classId);
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const roster = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.classId, classId))
    .orderBy(studentsTable.name);

  const lines = ["Studente;Data;Tipo;Materia;Prova;Voto;Firmato da"];
  for (const s of roster) {
    for (const e of (await signedEntries(s)).filter((x) => x.grade !== null)) {
      lines.push(
        [
          csvCell(s.name),
          csvCell(e.date.slice(0, 10)),
          csvCell(e.kind),
          csvCell(e.subject),
          csvCell(e.title),
          csvCell(e.grade),
          csvCell(e.signedBy),
        ].join(";"),
      );
    }
  }

  const fileName = `registro-${cls.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${fileName}"`);
  // BOM: senza, Excel in italiano sbaglia gli accenti.
  res.send("\uFEFF" + lines.join("\r\n"));
});

export default router;
