import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  scrutiniTable,
  scrutinioEntriesTable,
  teachersTable,
  quizAttemptsTable,
  type ScrutinioSummary,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { isClassTeacher, isCoordinator } from "../lib/classAccess";
import { signedEntriesByStudent, average, type RegistroEntry } from "./registro";
import { draftGiudizio } from "../lib/ai";

const router: IRouter = Router();

const CreateScrutinioSchema = z.object({
  classId: z.number().int().positive(),
  label: z.string().trim().min(1).max(120),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const UpdateEntrySchema = z.object({
  giudizio: z.string().trim().max(4000).optional(),
  status: z.enum(["bozza", "approvato"]).optional(),
});

/** Riassunto di uno studente a partire dalle sue prove firmate nel periodo. */
function buildSummary(
  entries: RegistroEntry[],
  practice: { attempts: number; correct: number; answered: number },
): ScrutinioSummary {
  const graded = entries.filter((e) => e.grade !== null);

  const perSubject = new Map<string, number[]>();
  for (const e of graded) {
    const list = perSubject.get(e.subject) ?? [];
    list.push(e.grade!);
    perSubject.set(e.subject, list);
  }

  const bySubject = Array.from(perSubject.entries())
    .map(([subject, grades]) => ({
      subject,
      average: Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10,
      count: grades.length,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  // Le prove arrivano dalla piu' recente: per l'andamento serve l'ordine storico.
  const chronological = graded.slice().reverse();
  const trend =
    chronological.length >= 2
      ? { first: chronological[0].grade!, last: chronological[chronological.length - 1].grade! }
      : null;

  return {
    bySubject,
    overallAverage: average(entries),
    gradesCount: graded.length,
    trend,
    practice: {
      attempts: practice.attempts,
      accuracyPercent: practice.answered
        ? Math.round((practice.correct / practice.answered) * 1000) / 10
        : null,
    },
  };
}

/** Filtra le prove al periodo dello scrutinio (estremi inclusi). */
function withinPeriod(entries: RegistroEntry[], from: string | null, to: string | null) {
  return entries.filter((e) => {
    const day = e.date.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

/** Gli scrutini di una classe. */
router.get("/classes/:id/scrutini", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await isClassTeacher(req.teacher!.id, classId))) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const rows = await db
    .select()
    .from(scrutiniTable)
    .where(eq(scrutiniTable.classId, classId))
    .orderBy(desc(scrutiniTable.createdAt));

  res.json(rows);
});

/**
 * Prepara lo scrutinio: raccoglie per ogni alunno i voti firmati del periodo
 * e congela la fotografia dei numeri. I giudizi restano da scrivere.
 */
router.post("/scrutini", requireTeacher, async (req, res): Promise<void> => {
  const parsed = CreateScrutinioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { classId, label } = parsed.data;
  const periodFrom = parsed.data.periodFrom ?? null;
  const periodTo = parsed.data.periodTo ?? null;

  if (!(await isClassTeacher(req.teacher!.id, classId))) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const roster = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.classId, classId))
    .orderBy(studentsTable.name);
  if (!roster.length) {
    res.status(400).json({ error: "La classe non ha ancora studenti: non c'è nulla da scrutinare." });
    return;
  }

  const [scrutinio] = await db
    .insert(scrutiniTable)
    .values({ classId, label, periodFrom, periodTo, createdByTeacherId: req.teacher!.id })
    .returning();

  const entriesByStudent = await signedEntriesByStudent(roster);
  const practiceByStudent = await practiceFor(roster);

  await db.insert(scrutinioEntriesTable).values(
    roster.map((s) => ({
      scrutinioId: scrutinio.id,
      studentId: s.id,
      studentName: s.name,
      summary: buildSummary(
        withinPeriod(entriesByStudent.get(s.id) ?? [], periodFrom, periodTo),
        practiceByStudent.get(s.id) ?? { attempts: 0, correct: 0, answered: 0 },
      ),
    })),
  );

  res.status(201).json(scrutinio);
});

/** Esercitazione autonoma per studente (quiz): impegno, non valutazione. */
async function practiceFor(
  roster: Array<{ id: number; name: string; authUserId: string | null; classId: number }>,
) {
  const result = new Map<number, { attempts: number; correct: number; answered: number }>(
    roster.map((s) => [s.id, { attempts: 0, correct: 0, answered: 0 }]),
  );
  const classIds = Array.from(new Set(roster.map((s) => s.classId)));
  const rows = await db
    .select({
      authUserId: quizAttemptsTable.authUserId,
      studentName: quizAttemptsTable.studentName,
      classId: quizAttemptsTable.classId,
      score: quizAttemptsTable.score,
      total: quizAttemptsTable.total,
    })
    .from(quizAttemptsTable)
    .where(inArray(quizAttemptsTable.classId, classIds));

  const byUser = new Map(roster.filter((s) => s.authUserId).map((s) => [s.authUserId!, s.id]));
  const byName = new Map(roster.map((s) => [`${s.classId}|${s.name}`, s.id]));

  for (const r of rows) {
    const id =
      (r.authUserId && byUser.get(r.authUserId)) ?? byName.get(`${r.classId}|${r.studentName}`) ?? null;
    if (id === null || typeof id !== "number") continue;
    const acc = result.get(id);
    if (!acc) continue;
    acc.attempts += 1;
    acc.correct += r.score;
    acc.answered += r.total;
  }
  return result;
}

/** Il fascicolo completo: scrutinio, classe e una scheda per alunno. */
router.get("/scrutini/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [scrutinio] = await db.select().from(scrutiniTable).where(eq(scrutiniTable.id, id));
  if (!scrutinio || !(await isClassTeacher(req.teacher!.id, scrutinio.classId))) {
    res.status(404).json({ error: "Scrutinio non trovato" });
    return;
  }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, scrutinio.classId));

  const entries = await db
    .select({
      id: scrutinioEntriesTable.id,
      studentId: scrutinioEntriesTable.studentId,
      studentName: scrutinioEntriesTable.studentName,
      summary: scrutinioEntriesTable.summary,
      aiDraft: scrutinioEntriesTable.aiDraft,
      giudizio: scrutinioEntriesTable.giudizio,
      status: scrutinioEntriesTable.status,
      approvedAt: scrutinioEntriesTable.approvedAt,
      approvedBy: teachersTable.name,
      besDsa: studentsTable.besDsa,
    })
    .from(scrutinioEntriesTable)
    .leftJoin(teachersTable, eq(teachersTable.id, scrutinioEntriesTable.approvedByTeacherId))
    .leftJoin(studentsTable, eq(studentsTable.id, scrutinioEntriesTable.studentId))
    .where(eq(scrutinioEntriesTable.scrutinioId, id))
    .orderBy(scrutinioEntriesTable.studentName);

  res.json({
    scrutinio,
    class: cls ? { id: cls.id, name: cls.name, gradeLevel: cls.gradeLevel } : null,
    entries,
    isCoordinator: await isCoordinator(req.teacher!.id, scrutinio.classId),
  });
});

/**
 * L'assistente prepara la bozza del giudizio per un alunno.
 * Non la approva e non la pubblica: la mette accanto, il consiglio decide.
 */
router.post("/scrutinio-entries/:id/draft", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [row] = await db
    .select({
      entry: scrutinioEntriesTable,
      scrutinio: scrutiniTable,
      className: classesTable.name,
      gradeLevel: classesTable.gradeLevel,
    })
    .from(scrutinioEntriesTable)
    .innerJoin(scrutiniTable, eq(scrutiniTable.id, scrutinioEntriesTable.scrutinioId))
    .innerJoin(classesTable, eq(classesTable.id, scrutiniTable.classId))
    .where(eq(scrutinioEntriesTable.id, id));

  if (!row || !(await isClassTeacher(req.teacher!.id, row.scrutinio.classId))) {
    res.status(404).json({ error: "Scheda non trovata" });
    return;
  }
  if (row.scrutinio.status === "chiuso") {
    res.status(409).json({ error: "Lo scrutinio è chiuso" });
    return;
  }

  const s = row.entry.summary;
  try {
    const { giudizio } = await draftGiudizio({
      studentName: row.entry.studentName,
      className: row.className,
      gradeLevel: row.gradeLevel,
      periodLabel: row.scrutinio.label,
      bySubject: s.bySubject,
      overallAverage: s.overallAverage,
      gradesCount: s.gradesCount,
      trend: s.trend,
      practice: s.practice,
    });

    // Se la risposta non contiene un testo utilizzabile, meglio dirlo che
    // scrivere una scheda vuota (o far esplodere la scrittura sul database).
    if (typeof giudizio !== "string" || !giudizio.trim()) {
      req.log.warn({ entryId: id }, "Bozza giudizio senza testo utilizzabile");
      res.status(502).json({ error: "La bozza è arrivata vuota. Riprova, oppure scrivi il giudizio a mano." });
      return;
    }

    const [updated] = await db
      .update(scrutinioEntriesTable)
      .set({
        aiDraft: giudizio,
        // Se il docente non ha ancora scritto nulla, la bozza gli fa da punto di partenza.
        ...(row.entry.giudizio.trim() === "" ? { giudizio } : {}),
      })
      .where(eq(scrutinioEntriesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Bozza giudizio fallita");
    res.status(500).json({ error: "Non sono riuscito a preparare la bozza. Riprova o scrivila a mano." });
  }
});

/** Il docente modifica o approva il giudizio. */
router.patch("/scrutinio-entries/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = UpdateEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ entry: scrutinioEntriesTable, scrutinio: scrutiniTable })
    .from(scrutinioEntriesTable)
    .innerJoin(scrutiniTable, eq(scrutiniTable.id, scrutinioEntriesTable.scrutinioId))
    .where(eq(scrutinioEntriesTable.id, id));

  if (!row || !(await isClassTeacher(req.teacher!.id, row.scrutinio.classId))) {
    res.status(404).json({ error: "Scheda non trovata" });
    return;
  }
  if (row.scrutinio.status === "chiuso") {
    res.status(409).json({ error: "Lo scrutinio è chiuso: le schede non si modificano più" });
    return;
  }

  const wantsApproval = parsed.data.status === "approvato";
  const finalText = (parsed.data.giudizio ?? row.entry.giudizio).trim();
  if (wantsApproval && !finalText) {
    res.status(400).json({ error: "Non si approva un giudizio vuoto" });
    return;
  }

  const [updated] = await db
    .update(scrutinioEntriesTable)
    .set({
      ...(parsed.data.giudizio !== undefined ? { giudizio: parsed.data.giudizio } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(wantsApproval
        ? { approvedByTeacherId: req.teacher!.id, approvedAt: new Date() }
        : parsed.data.status === "bozza"
          ? { approvedByTeacherId: null, approvedAt: null }
          : {}),
    })
    .where(eq(scrutinioEntriesTable.id, id))
    .returning();

  res.json(updated);
});

/** Il coordinatore chiude lo scrutinio: da qui in poi è un documento. */
router.post("/scrutini/:id/close", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [scrutinio] = await db.select().from(scrutiniTable).where(eq(scrutiniTable.id, id));
  if (!scrutinio || !(await isClassTeacher(req.teacher!.id, scrutinio.classId))) {
    res.status(404).json({ error: "Scrutinio non trovato" });
    return;
  }
  if (!(await isCoordinator(req.teacher!.id, scrutinio.classId))) {
    res.status(403).json({ error: "Solo il coordinatore può chiudere lo scrutinio" });
    return;
  }
  if (scrutinio.status === "chiuso") {
    res.status(409).json({ error: "Lo scrutinio è già chiuso" });
    return;
  }

  const pending = await db
    .select({ id: scrutinioEntriesTable.id })
    .from(scrutinioEntriesTable)
    .where(
      and(eq(scrutinioEntriesTable.scrutinioId, id), eq(scrutinioEntriesTable.status, "bozza")),
    );
  if (pending.length) {
    res.status(409).json({
      error: `Ci sono ancora ${pending.length} giudizi da approvare: il consiglio deve pronunciarsi su tutti.`,
    });
    return;
  }

  const [updated] = await db
    .update(scrutiniTable)
    .set({ status: "chiuso", closedAt: new Date() })
    .where(eq(scrutiniTable.id, id))
    .returning();

  res.json(updated);
});

/** Elimina uno scrutinio preparato per errore (solo se ancora aperto). */
router.delete("/scrutini/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [scrutinio] = await db.select().from(scrutiniTable).where(eq(scrutiniTable.id, id));
  if (!scrutinio || !(await isCoordinator(req.teacher!.id, scrutinio.classId))) {
    res.status(404).json({ error: "Scrutinio non trovato" });
    return;
  }
  if (scrutinio.status === "chiuso") {
    res.status(409).json({ error: "Uno scrutinio chiuso non si elimina" });
    return;
  }

  await db.delete(scrutiniTable).where(eq(scrutiniTable.id, id));
  res.status(204).end();
});

export default router;
