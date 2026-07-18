import { Router, type IRouter } from "express";
import { eq, inArray, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  materialsTable,
  materialClassesTable,
  quizAttemptsTable,
  oralSessionsTable,
  reviewItemsTable,
} from "@sillabo/db";
import type { GradedAnswerRecord } from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { askTeacherAssistant } from "../lib/ai";

const router: IRouter = Router();

const AskSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .default([]),
});

/** Raccoglie un quadro sintetico dei dati delle classi del docente per l'AI. */
async function buildClassSnapshot(teacherId: number): Promise<string> {
  const classes = await db.select().from(classesTable).where(eq(classesTable.teacherId, teacherId));
  if (!classes.length) return "Il docente non ha ancora classi.";

  const classIds = classes.map((c) => c.id);
  const students = await db.select().from(studentsTable).where(inArray(studentsTable.classId, classIds));

  const materialLinks = await db
    .select({ materialId: materialClassesTable.materialId, classId: materialClassesTable.classId })
    .from(materialClassesTable)
    .where(inArray(materialClassesTable.classId, classIds));
  const materialIds = Array.from(new Set(materialLinks.map((l) => l.materialId)));

  const materials = materialIds.length
    ? await db.select().from(materialsTable).where(inArray(materialsTable.id, materialIds))
    : [];
  const attempts = materialIds.length
    ? await db
        .select()
        .from(quizAttemptsTable)
        .where(inArray(quizAttemptsTable.materialId, materialIds))
        .orderBy(desc(quizAttemptsTable.createdAt))
        .limit(400)
    : [];
  const orals = materialIds.length
    ? await db.select().from(oralSessionsTable).where(inArray(oralSessionsTable.materialId, materialIds))
    : [];
  const reviews = materialIds.length
    ? await db.select().from(reviewItemsTable).where(inArray(reviewItemsTable.materialId, materialIds))
    : [];

  const materialTitle = new Map(materials.map((m) => [m.id, m.title]));

  const lines: string[] = [];
  lines.push(`CLASSI (${classes.length}):`);
  for (const c of classes) {
    const roster = students.filter((s) => s.classId === c.id);
    lines.push(`- ${c.name} (${c.gradeLevel}): ${roster.length} studenti: ${roster.map((s) => s.name + (s.besDsa ? " [BES/DSA]" : "")).join(", ") || "nessuno"}`);
  }

  lines.push(`\nMATERIALI (${materials.length}):`);
  for (const m of materials) {
    lines.push(`- [${m.id}] "${m.title}" (${m.subject}, ${m.gradeLevel})${m.curriculumTopic ? ` — tema: ${m.curriculumTopic}` : ""}`);
  }

  lines.push(`\nQUIZ SVOLTI (${attempts.length}, piu' recenti prima):`);
  for (const a of attempts.slice(0, 60)) {
    const wrongTopics = (a.gradedAnswers as GradedAnswerRecord[])
      .filter((g) => !g.correct && g.topic)
      .map((g) => g.topic);
    lines.push(
      `- ${a.studentName} | "${materialTitle.get(a.materialId) ?? a.materialId}" | ${a.score}/${a.total} | ${new Date(a.createdAt).toLocaleDateString("it-IT")}${wrongTopics.length ? ` | errori su: ${Array.from(new Set(wrongTopics)).join(", ")}` : ""}`,
    );
  }

  const doneOrals = orals.filter((o) => o.status === "completata");
  lines.push(`\nINTERROGAZIONI SIMULATE COMPLETATE (${doneOrals.length}):`);
  for (const o of doneOrals.slice(0, 30)) {
    lines.push(`- ${o.studentName} | "${materialTitle.get(o.materialId) ?? o.materialId}" | voto ${o.grade ?? "n.d."}/10`);
  }

  const pendingReviews = reviews.filter((r) => r.status === "da_fare");
  lines.push(`\nRIPASSI IN SOSPESO: ${pendingReviews.length} (completati: ${reviews.length - pendingReviews.length})`);

  return lines.join("\n");
}

router.post("/assistant", requireTeacher, async (req, res): Promise<void> => {
  const parsed = AskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const snapshot = await buildClassSnapshot(req.teacher!.id);
    const answer = await askTeacherAssistant(snapshot, parsed.data.history, parsed.data.question);
    res.json({ answer });
  } catch (err) {
    req.log.error({ err }, "Teacher assistant failed");
    res.status(500).json({ error: "L'assistente non e' riuscito a rispondere. Riprova." });
  }
});

export default router;
