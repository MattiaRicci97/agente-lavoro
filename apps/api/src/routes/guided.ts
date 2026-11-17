import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  materialsTable,
  materialClassesTable,
  learningObjectivesTable,
  guidedActivitiesTable,
  guidedActivityMaterialsTable,
  guidedActivityObjectivesTable,
  guidedActivitySessionsTable,
  type GuidedActivity,
} from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { classForTeacher } from "../lib/classAccess";
import { announceToClasses } from "../lib/classFeed";
import { searchCourse, courseMaterials, sourceLabel, type Passage } from "../lib/courseSearch";
import { effectiveObjectives } from "../lib/objectives";
import { askCourseAssistant, summarizeGuidedSession } from "../lib/ai";
import { summarizeSessions } from "../lib/guided";

const router: IRouter = Router();

/**
 * Attivita' guidate: il docente decide argomento e materiali, lo studente
 * lavora in chat con l'assistente che lo guida con domande, e al docente
 * torna solo un riepilogo della classe.
 */

const parseId = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const CreateBody = z.object({
  subject: z.string().trim().min(1).max(100),
  title: z.string().trim().min(3).max(140),
  brief: z.string().trim().min(10).max(1500),
  materialIds: z.array(z.number().int().positive()).min(1).max(20),
  objectiveIds: z.array(z.number().int().positive()).max(8).default([]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

async function activityParts(activityIds: number[]) {
  if (!activityIds.length) return { materials: new Map<number, number[]>(), objectives: new Map<number, Array<{ id: number; code: string; title: string }>>() };
  const mats = await db.select().from(guidedActivityMaterialsTable).where(inArray(guidedActivityMaterialsTable.activityId, activityIds));
  const objs = await db
    .select({
      activityId: guidedActivityObjectivesTable.activityId,
      id: learningObjectivesTable.id,
      code: learningObjectivesTable.code,
      title: learningObjectivesTable.title,
    })
    .from(guidedActivityObjectivesTable)
    .innerJoin(learningObjectivesTable, eq(learningObjectivesTable.id, guidedActivityObjectivesTable.objectiveId))
    .where(inArray(guidedActivityObjectivesTable.activityId, activityIds));
  const materials = new Map<number, number[]>();
  for (const m of mats) materials.set(m.activityId, [...(materials.get(m.activityId) ?? []), m.materialId]);
  const objectives = new Map<number, Array<{ id: number; code: string; title: string }>>();
  for (const o of objs) objectives.set(o.activityId, [...(objectives.get(o.activityId) ?? []), { id: o.id, code: o.code, title: o.title }]);
  return { materials, objectives };
}

// ---------------------------------------------------------------------------
// Docente
// ---------------------------------------------------------------------------

/** Cosa serve per comporre un'attivita': le materie della classe con i loro materiali e obiettivi. */
router.get("/classes/:id/guided-options", requireTeacher, async (req, res): Promise<void> => {
  const classId = parseId(req.params.id);
  const cls = classId ? await classForTeacher(req.teacher!.id, classId) : null;
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  // Le materie per cui la classe ha gia' del materiale condiviso.
  const subjectRows = await db
    .select({ subject: sql<string>`min(${materialsTable.subject})` })
    .from(materialsTable)
    .innerJoin(materialClassesTable, eq(materialClassesTable.materialId, materialsTable.id))
    .where(eq(materialClassesTable.classId, cls.id))
    .groupBy(sql`lower(${materialsTable.subject})`)
    .orderBy(sql`min(${materialsTable.subject})`);
  const subjects = subjectRows.map((r) => r.subject);
  const subject = typeof req.query.subject === "string" ? req.query.subject.trim() : "";
  if (!subject) {
    res.json({ subjects, materials: [], objectives: [] });
    return;
  }
  const materials = await courseMaterials(cls.id, subject);
  const objectives = (await effectiveObjectives([cls.institutionId], {}))
    .filter((o) => o.subject.trim().toLowerCase() === subject.toLowerCase())
    .map((o) => ({ id: o.id, code: o.code, title: o.title, gradeLevel: o.gradeLevel }));
  res.json({ subjects, materials: materials.map((m) => ({ id: m.id, label: sourceLabel(m), kind: m.kind })), objectives });
});

/** Le attivita' della classe, ciascuna con il suo riepilogo. */
router.get("/classes/:id/guided-activities", requireTeacher, async (req, res): Promise<void> => {
  const classId = parseId(req.params.id);
  const cls = classId ? await classForTeacher(req.teacher!.id, classId) : null;
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const activities = await db
    .select()
    .from(guidedActivitiesTable)
    .where(eq(guidedActivitiesTable.classId, cls.id))
    .orderBy(desc(guidedActivitiesTable.createdAt));
  const ids = activities.map((a) => a.id);
  const parts = await activityParts(ids);
  const sessions = ids.length
    ? await db.select().from(guidedActivitySessionsTable).where(inArray(guidedActivitySessionsTable.activityId, ids))
    : [];
  const [{ students }] = await db
    .select({ students: sql<number>`count(*)::int` })
    .from(studentsTable)
    .where(eq(studentsTable.classId, cls.id));

  res.json({
    activities: activities.map((a) => ({
      id: a.id,
      subject: a.subject,
      title: a.title,
      brief: a.brief,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      materialsCount: (parts.materials.get(a.id) ?? []).length,
      summary: summarizeSessions({
        classSize: students,
        objectives: parts.objectives.get(a.id) ?? [],
        sessions: sessions.filter((s) => s.activityId === a.id),
      }),
    })),
  });
});

router.post("/classes/:id/guided-activities", requireTeacher, async (req, res): Promise<void> => {
  const classId = parseId(req.params.id);
  const cls = classId ? await classForTeacher(req.teacher!.id, classId) : null;
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  // Solo materiali gia' condivisi con questa classe per questa materia.
  const available = new Set((await courseMaterials(cls.id, data.subject)).map((m) => m.id));
  const materialIds = Array.from(new Set(data.materialIds));
  if (!materialIds.every((id) => available.has(id))) {
    res.status(400).json({ error: "Uno dei materiali scelti non e' condiviso con questa classe per questa materia" });
    return;
  }
  const allowedObjectives = new Set(
    (await effectiveObjectives([cls.institutionId], {}))
      .filter((o) => o.subject.trim().toLowerCase() === data.subject.toLowerCase())
      .map((o) => o.id),
  );
  const objectiveIds = Array.from(new Set(data.objectiveIds));
  if (!objectiveIds.every((id) => allowedObjectives.has(id))) {
    res.status(400).json({ error: "Uno degli obiettivi scelti non appartiene alla mappa di questa materia" });
    return;
  }

  const [activity] = await db
    .insert(guidedActivitiesTable)
    .values({
      classId: cls.id,
      teacherId: req.teacher!.id,
      subject: data.subject,
      title: data.title,
      brief: data.brief,
      dueDate: data.dueDate ?? null,
    })
    .returning();
  await db.insert(guidedActivityMaterialsTable).values(materialIds.map((materialId) => ({ activityId: activity.id, materialId })));
  if (objectiveIds.length) {
    await db.insert(guidedActivityObjectivesTable).values(objectiveIds.map((objectiveId) => ({ activityId: activity.id, objectiveId })));
  }

  await announceToClasses({
    classIds: [cls.id],
    teacherId: req.teacher!.id,
    authorName: req.teacher!.name,
    kind: "compito",
    title: `Attività guidata: ${data.title}`,
    body: [
      data.brief,
      data.dueDate ? `Da svolgere entro il ${new Date(`${data.dueDate}T00:00:00`).toLocaleDateString("it-IT")}.` : "",
      "La trovi in Chiedi al corso.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  res.status(201).json({ id: activity.id });
});

router.delete("/guided-activities/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [activity] = id ? await db.select().from(guidedActivitiesTable).where(eq(guidedActivitiesTable.id, id)) : [];
  if (!activity || !(await classForTeacher(req.teacher!.id, activity.classId))) {
    res.status(404).json({ error: "Attivita' non trovata" });
    return;
  }
  await db.delete(guidedActivitiesTable).where(eq(guidedActivitiesTable.id, activity.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Studente
// ---------------------------------------------------------------------------

/** L'attivita' e la riga dello studente nella sua classe, o null. */
async function activityForStudent(authUserId: string, activityId: number | null) {
  if (!activityId) return null;
  const [activity] = await db.select().from(guidedActivitiesTable).where(eq(guidedActivitiesTable.id, activityId));
  if (!activity) return null;
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.authUserId, authUserId), eq(studentsTable.classId, activity.classId)));
  return student ? { activity, student } : null;
}

const studentView = (a: GuidedActivity) => ({ id: a.id, classId: a.classId, subject: a.subject, title: a.title, brief: a.brief, dueDate: a.dueDate });

/** Le attivita' assegnate allo studente, con il suo stato. */
router.get("/me/guided-activities", requireAuth, async (req, res): Promise<void> => {
  const students = await db.select().from(studentsTable).where(eq(studentsTable.authUserId, req.authUserId!));
  if (!students.length) {
    res.json({ activities: [] });
    return;
  }
  const activities = await db
    .select()
    .from(guidedActivitiesTable)
    .where(inArray(guidedActivitiesTable.classId, students.map((s) => s.classId)))
    .orderBy(desc(guidedActivitiesTable.createdAt))
    .limit(30);
  const sessions = activities.length
    ? await db
        .select()
        .from(guidedActivitySessionsTable)
        .where(
          and(
            inArray(guidedActivitySessionsTable.activityId, activities.map((a) => a.id)),
            inArray(guidedActivitySessionsTable.studentId, students.map((s) => s.id)),
          ),
        )
    : [];
  const byActivity = new Map(sessions.map((s) => [s.activityId, s]));
  const parts = await activityParts(activities.map((a) => a.id));
  res.json({
    activities: activities.map((a) => {
      const session = byActivity.get(a.id);
      return {
        ...studentView(a),
        status: session?.completedAt ? "completata" : session ? "iniziata" : "da_fare",
        objectives: (parts.objectives.get(a.id) ?? []).map((o) => o.title),
      };
    }),
  });
});

const History = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
  .max(30)
  .default([]);

const ChatBody = z.object({ question: z.string().trim().min(1).max(2000), history: History });

router.post("/guided-activities/:id/chat", requireAuth, async (req, res): Promise<void> => {
  const found = await activityForStudent(req.authUserId!, parseId(req.params.id));
  if (!found) {
    res.status(404).json({ error: "Attivita' non trovata" });
    return;
  }
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { activity, student } = found;
  const materialIds = (await activityParts([activity.id])).materials.get(activity.id) ?? [];
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, activity.classId));

  const seen: Passage[] = [];
  const search = async (query: string) => {
    const passages = await searchCourse({ classId: activity.classId, subject: activity.subject, query, limit: 6, onlyMaterialIds: materialIds });
    for (const p of passages) if (!seen.some((f) => f.content === p.content)) seen.push(p);
    return passages.map((p) => ({ source: sourceLabel(p), content: p.content }));
  };

  try {
    // La ricerca parte dalla domanda e, se e' troppo generica, dal titolo dell'attivita'.
    let initial = await search(parsed.data.question);
    if (!initial.length) initial = await search(activity.title);
    const { answer, usedPassages } = await askCourseAssistant({
      subject: activity.subject,
      gradeLevel: cls?.gradeLevel ?? "",
      besDsa: student.besDsa || req.authUser!.besDsa,
      history: parsed.data.history.slice(-12),
      question: parsed.data.question,
      initialPassages: initial,
      search,
      guided: { title: activity.title, brief: activity.brief },
    });
    await db
      .insert(guidedActivitySessionsTable)
      .values({ activityId: activity.id, studentId: student.id, turns: 1 })
      .onConflictDoUpdate({
        target: [guidedActivitySessionsTable.activityId, guidedActivitySessionsTable.studentId],
        set: { turns: sql`${guidedActivitySessionsTable.turns} + 1` },
      });
    const ordered = usedPassages.map((u) => seen.find((f) => f.content === u.content)).filter((p): p is Passage => !!p);
    res.json({ answer, passages: ordered.map((p, i) => ({ n: i + 1, label: sourceLabel(p), materialId: p.materialId })) });
  } catch (err) {
    req.log.error({ err }, "Chat dell'attivita' guidata fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a rispondere. Riprova tra poco." });
  }
});

/**
 * Lo studente chiude l'attivita'. Dalla conversazione (che resta sul suo
 * dispositivo) si ricavano solo i segnali per obiettivo e i punti di blocco,
 * che confluiscono nel riepilogo di classe. Nessun voto, nessun profilo.
 */
router.post("/guided-activities/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const found = await activityForStudent(req.authUserId!, parseId(req.params.id));
  if (!found) {
    res.status(404).json({ error: "Attivita' non trovata" });
    return;
  }
  const parsed = z.object({ history: History }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { activity, student } = found;
  const [session] = await db
    .select()
    .from(guidedActivitySessionsTable)
    .where(and(eq(guidedActivitySessionsTable.activityId, activity.id), eq(guidedActivitySessionsTable.studentId, student.id)));
  if (!session || session.turns < 1) {
    res.status(409).json({ error: "Prima di chiudere l'attivita' prova a lavorarci con l'assistente." });
    return;
  }

  const objectives = (await activityParts([activity.id])).objectives.get(activity.id) ?? [];
  let signals: Array<{ objectiveId: number; level: "sicuro" | "incerto" }> = [];
  let stuckPoints: string[] = [];
  // Con meno di due scambi non c'e' abbastanza per dire qualcosa.
  if (parsed.data.history.filter((m) => m.role === "user").length >= 2) {
    try {
      const summary = await summarizeGuidedSession({
        subject: activity.subject,
        title: activity.title,
        brief: activity.brief,
        objectives: objectives.map((o) => ({ code: o.code, title: o.title })),
        transcript: parsed.data.history,
      });
      const idByCode = new Map(objectives.map((o) => [o.code, o.id]));
      signals = summary.signals.map((s) => ({ objectiveId: idByCode.get(s.objectiveCode)!, level: s.level }));
      stuckPoints = summary.stuckPoints;
    } catch (err) {
      // Il riepilogo e' un di piu': l'attivita' si chiude comunque.
      req.log.error({ err }, "Riepilogo dell'attivita' guidata non riuscito");
    }
  }
  await db
    .update(guidedActivitySessionsTable)
    .set({ signals, stuckPoints, completedAt: new Date() })
    .where(eq(guidedActivitySessionsTable.id, session.id));
  res.json({ status: "completata" });
});

export default router;
