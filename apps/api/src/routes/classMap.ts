import { Router, type IRouter } from "express";
import { eq, and, inArray, ne, asc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  studentsTable,
  diagnosisItemsTable,
  learningObjectivesTable,
  recoveryActivitiesTable,
} from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { classForTeacher } from "../lib/classAccess";
import { masteryForStudents } from "../lib/mastery";
import { draftRecoveryActivity } from "../lib/ai";
import { ERROR_TYPE_FOR_PROMPT } from "../lib/recoveryPrompt";

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface ClassMap {
  class: { id: number; name: string; gradeLevel: string };
  subjects: string[];
  subject: string | null;
  students: Array<{ id: number; name: string }>;
  objectives: Array<{
    id: number;
    code: string;
    title: string;
    description: string;
    counts: { acquisito: number; fragile: number; mancante: number; inEsercizio: number };
    /** Studenti con una verifica firmata su questo obiettivo. */
    assessed: number;
    commonErrors: Array<{ errorType: string; students: number; percent: number }>;
    /** Chi ha la stessa lacuna: il gruppo di recupero naturale. */
    groupStudentIds: number[];
    activity: { aiDraft: string; body: string; updatedAt: Date } | null;
  }>;
  /** cells[studentId][objectiveId] = stato, "in_esercizio" o assente. */
  cells: Record<number, Record<number, string>>;
}

/** La mappa della classe: obiettivi x studenti, errori comuni, gruppi. */
export async function buildClassMap(
  cls: { id: number; name: string; gradeLevel: string },
  subjectFilter?: string,
): Promise<ClassMap> {
  const students = await db
    .select({ id: studentsTable.id, name: studentsTable.name })
    .from(studentsTable)
    .where(eq(studentsTable.classId, cls.id))
    .orderBy(asc(studentsTable.name));
  const mastery = await masteryForStudents(students.map((s) => s.id));

  const subjects = Array.from(
    new Set(Array.from(mastery.values()).flatMap((rows) => rows.map((r) => r.objective.subject))),
  ).sort((a, b) => a.localeCompare(b, "it"));
  const subject = subjectFilter && subjects.includes(subjectFilter) ? subjectFilter : (subjects[0] ?? null);

  const cells: ClassMap["cells"] = {};
  const objectiveIds = new Set<number>();
  for (const s of students) {
    cells[s.id] = {};
    for (const row of mastery.get(s.id) ?? []) {
      if (row.objective.subject !== subject) continue;
      cells[s.id][row.objective.id] = row.state ?? "in_esercizio";
      objectiveIds.add(row.objective.id);
    }
  }
  const ids = Array.from(objectiveIds);
  const objectives = ids.length
    ? await db
        .select()
        .from(learningObjectivesTable)
        .where(inArray(learningObjectivesTable.id, ids))
        .orderBy(asc(learningObjectivesTable.gradeLevel), asc(learningObjectivesTable.ord), asc(learningObjectivesTable.code))
    : [];

  // Errori comuni: dalle diagnosi firmate della classe, contando studenti e non esercizi.
  const studentIds = students.map((s) => s.id);
  const errors =
    ids.length && studentIds.length
      ? await db
          .select({
            studentId: diagnosisItemsTable.studentId,
            objectiveId: diagnosisItemsTable.objectiveId,
            errorType: diagnosisItemsTable.errorType,
          })
          .from(diagnosisItemsTable)
          .where(
            and(
              inArray(diagnosisItemsTable.studentId, studentIds),
              inArray(diagnosisItemsTable.objectiveId, ids),
              eq(diagnosisItemsTable.status, "validata"),
              ne(diagnosisItemsTable.outcome, "corretto"),
            ),
          )
      : [];
  const activities = ids.length
    ? await db
        .select()
        .from(recoveryActivitiesTable)
        .where(and(eq(recoveryActivitiesTable.classId, cls.id), inArray(recoveryActivitiesTable.objectiveId, ids)))
    : [];
  const activityByObjective = new Map(activities.map((a) => [a.objectiveId, a]));

  return {
    class: { id: cls.id, name: cls.name, gradeLevel: cls.gradeLevel },
    subjects,
    subject,
    students,
    objectives: objectives.map((o) => {
      const counts = { acquisito: 0, fragile: 0, mancante: 0, inEsercizio: 0 };
      const group: number[] = [];
      for (const s of students) {
        const state = cells[s.id][o.id];
        if (state === "acquisito") counts.acquisito += 1;
        else if (state === "fragile") counts.fragile += 1;
        else if (state === "mancante") counts.mancante += 1;
        else if (state === "in_esercizio") counts.inEsercizio += 1;
        if (state === "fragile" || state === "mancante") group.push(s.id);
      }
      const assessed = counts.acquisito + counts.fragile + counts.mancante;
      const byType = new Map<string, Set<number>>();
      for (const e of errors) {
        if (e.objectiveId !== o.id || e.studentId === null) continue;
        const type = e.errorType ?? "non_classificato";
        byType.set(type, (byType.get(type) ?? new Set()).add(e.studentId));
      }
      const activity = activityByObjective.get(o.id);
      return {
        id: o.id,
        code: o.code,
        title: o.title,
        description: o.description,
        counts,
        assessed,
        commonErrors: Array.from(byType.entries())
          .map(([errorType, set]) => ({
            errorType,
            students: set.size,
            percent: assessed ? Math.round((set.size / assessed) * 100) : 0,
          }))
          .sort((a, b) => b.students - a.students),
        groupStudentIds: group,
        activity: activity ? { aiDraft: activity.aiDraft, body: activity.body, updatedAt: activity.updatedAt } : null,
      };
    }),
    cells,
  };
}

router.get("/classes/:id/mastery-map", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const cls = id ? await classForTeacher(req.teacher!.id, id) : null;
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const subject = typeof req.query.subject === "string" ? req.query.subject : undefined;
  res.json(await buildClassMap(cls, subject));
});

/** L'assistente scrive la bozza di un'attivita' da dieci minuti per un obiettivo. */
router.post("/classes/:id/objectives/:objectiveId/activity-draft", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const objectiveId = parseId(req.params.objectiveId);
  const cls = id ? await classForTeacher(req.teacher!.id, id) : null;
  if (!cls || !objectiveId) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const [objective] = await db.select().from(learningObjectivesTable).where(eq(learningObjectivesTable.id, objectiveId));
  const map = objective ? await buildClassMap(cls, objective.subject) : null;
  const row = map?.objectives.find((o) => o.id === objectiveId);
  if (!objective || !map || !row) {
    res.status(404).json({ error: "Nessun dato della classe su questo obiettivo" });
    return;
  }
  try {
    const draft = await draftRecoveryActivity({
      subject: objective.subject,
      gradeLevel: cls.gradeLevel,
      objective: { code: objective.code, title: objective.title, description: objective.description },
      commonError: row.commonErrors[0] ? (ERROR_TYPE_FOR_PROMPT[row.commonErrors[0].errorType] ?? null) : null,
      groupSize: row.groupStudentIds.length,
      classSize: map.students.length,
    });
    const text = `${draft.title}\n\n${draft.activity}`;
    const now = new Date();
    // La bozza nuova non sovrascrive il testo che il docente ha gia' scritto.
    const [saved] = await db
      .insert(recoveryActivitiesTable)
      .values({ classId: cls.id, objectiveId, aiDraft: text, body: text, updatedByTeacherId: req.teacher!.id, updatedAt: now })
      .onConflictDoUpdate({
        target: [recoveryActivitiesTable.classId, recoveryActivitiesTable.objectiveId],
        set: { aiDraft: text, updatedAt: now },
      })
      .returning();
    res.json({ aiDraft: saved.aiDraft, body: saved.body, updatedAt: saved.updatedAt });
  } catch (err) {
    req.log.error({ err }, "Bozza attivita' fallita");
    res.status(502).json({ error: "L'assistente non e' riuscito a preparare l'attivita'. Riprova, o scrivila tu." });
  }
});

/** Il docente salva la propria versione dell'attivita'. */
router.put("/classes/:id/objectives/:objectiveId/activity", requireTeacher, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const objectiveId = parseId(req.params.objectiveId);
  const cls = id ? await classForTeacher(req.teacher!.id, id) : null;
  if (!cls || !objectiveId) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }
  const parsed = z.object({ body: z.string().trim().max(6000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [objective] = await db
    .select({ id: learningObjectivesTable.id })
    .from(learningObjectivesTable)
    .where(eq(learningObjectivesTable.id, objectiveId));
  if (!objective) {
    res.status(404).json({ error: "Obiettivo non trovato" });
    return;
  }
  const now = new Date();
  const [saved] = await db
    .insert(recoveryActivitiesTable)
    .values({ classId: cls.id, objectiveId, body: parsed.data.body, updatedByTeacherId: req.teacher!.id, updatedAt: now })
    .onConflictDoUpdate({
      target: [recoveryActivitiesTable.classId, recoveryActivitiesTable.objectiveId],
      set: { body: parsed.data.body, updatedByTeacherId: req.teacher!.id, updatedAt: now },
    })
    .returning();
  res.json({ aiDraft: saved.aiDraft, body: saved.body, updatedAt: saved.updatedAt });
});

export default router;
