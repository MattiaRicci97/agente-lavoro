import { Router, type IRouter } from "express";
import { eq, inArray, asc, and, gte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  examDatesTable,
  classesTable,
  studentsTable,
  materialsTable,
  questionsTable,
  reviewItemsTable,
} from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const CreateExamDateSchema = z.object({
  classId: z.number().int().positive(),
  materialId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Elenco verifiche per il docente (tutte le sue classi). */
router.get("/exam-dates", requireTeacher, async (req, res): Promise<void> => {
  const classes = await db
    .select({ id: classesTable.id, name: classesTable.name })
    .from(classesTable)
    .where(eq(classesTable.teacherId, req.teacher!.id));

  if (!classes.length) {
    res.json([]);
    return;
  }
  const classNames = new Map(classes.map((c) => [c.id, c.name]));

  const rows = await db
    .select()
    .from(examDatesTable)
    .where(inArray(examDatesTable.classId, classes.map((c) => c.id)))
    .orderBy(asc(examDatesTable.examDate));

  res.json(rows.map((r) => ({ ...r, className: classNames.get(r.classId) ?? "" })));
});

router.post("/exam-dates", requireTeacher, async (req, res): Promise<void> => {
  const parsed = CreateExamDateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [cls] = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, parsed.data.classId), eq(classesTable.teacherId, req.teacher!.id)));
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const [created] = await db
    .insert(examDatesTable)
    .values({
      classId: parsed.data.classId,
      materialId: parsed.data.materialId ?? null,
      title: parsed.data.title,
      subject: parsed.data.subject,
      examDate: parsed.data.examDate,
    })
    .returning();

  res.status(201).json({ ...created, className: cls.name });
});

router.delete("/exam-dates/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [row] = await db
    .select({ examId: examDatesTable.id, teacherId: classesTable.teacherId })
    .from(examDatesTable)
    .innerJoin(classesTable, eq(classesTable.id, examDatesTable.classId))
    .where(eq(examDatesTable.id, id));

  if (!row || row.teacherId !== req.teacher!.id) {
    res.status(404).json({ error: "Verifica non trovata" });
    return;
  }

  await db.delete(examDatesTable).where(eq(examDatesTable.id, id));
  res.status(204).end();
});

/** Verifiche in arrivo per lo studente autenticato (le sue classi). */
router.get("/exam-dates/mine", requireAuth, async (req, res): Promise<void> => {
  const memberships = await db
    .select({ classId: studentsTable.classId, name: studentsTable.name })
    .from(studentsTable)
    .where(eq(studentsTable.authUserId, req.authUserId!));

  if (!memberships.length) {
    res.json([]);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: examDatesTable.id,
      classId: examDatesTable.classId,
      materialId: examDatesTable.materialId,
      title: examDatesTable.title,
      subject: examDatesTable.subject,
      examDate: examDatesTable.examDate,
      materialTitle: materialsTable.title,
    })
    .from(examDatesTable)
    .leftJoin(materialsTable, eq(materialsTable.id, examDatesTable.materialId))
    .where(
      and(
        inArray(examDatesTable.classId, memberships.map((m) => m.classId)),
        gte(examDatesTable.examDate, today),
      ),
    )
    .orderBy(asc(examDatesTable.examDate));

  res.json(rows);
});

/**
 * Genera il piano di ripasso spaziato a ritroso dalla data della verifica
 * (7, 3 e 1 giorno prima), sui temi del materiale collegato.
 */
router.post("/exam-dates/:id/plan", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [exam] = await db.select().from(examDatesTable).where(eq(examDatesTable.id, id));
  if (!exam) {
    res.status(404).json({ error: "Verifica non trovata" });
    return;
  }

  const [membership] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.authUserId, req.authUserId!), eq(studentsTable.classId, exam.classId)));
  if (!membership) {
    res.status(403).json({ error: "Non fai parte di questa classe" });
    return;
  }
  if (!exam.materialId) {
    res.status(400).json({ error: "Questa verifica non ha un materiale collegato" });
    return;
  }

  // Temi del materiale: dai suoi quiz (max 5 distinti).
  const questionRows = await db
    .select({ topic: questionsTable.topic })
    .from(questionsTable)
    .where(eq(questionsTable.materialId, exam.materialId));
  const topics = Array.from(new Set(questionRows.map((q) => q.topic).filter(Boolean))).slice(0, 5);
  if (!topics.length) {
    res.status(400).json({ error: "Il materiale collegato non ha ancora domande da cui ricavare i temi" });
    return;
  }

  const examTime = new Date(`${exam.examDate}T00:00:00`).getTime();
  const now = Date.now();
  const offsets = [7, 3, 1];
  const dueDates = offsets
    .map((days) => new Date(examTime - days * 24 * 60 * 60 * 1000))
    .filter((d) => d.getTime() > now - 24 * 60 * 60 * 1000)
    .map((d) => d.toISOString().slice(0, 10));

  if (!dueDates.length) {
    res.status(400).json({ error: "La verifica e' troppo vicina per pianificare un ripasso" });
    return;
  }

  // Evita duplicati: rimuove il piano precedente per stesso materiale/studente ancora da fare.
  await db
    .delete(reviewItemsTable)
    .where(
      and(
        eq(reviewItemsTable.materialId, exam.materialId),
        eq(reviewItemsTable.studentName, membership.name),
        eq(reviewItemsTable.status, "da_fare"),
      ),
    );

  const values = dueDates.flatMap((dueDate) =>
    topics.map((topic) => ({
      materialId: exam.materialId!,
      studentName: membership.name,
      topic,
      dueDate,
      status: "da_fare",
    })),
  );

  await db.insert(reviewItemsTable).values(values);
  res.status(201).json({ created: values.length, topics, dueDates });
});

export default router;
