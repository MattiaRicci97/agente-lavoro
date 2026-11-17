import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** Simulazione della prima prova: traccia ministeriale, griglia ufficiale, traccia correggibile dal docente. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Simulazione della prima prova di Maturita'", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, exam: 0 };
  const tokens = { teacher: "", other: "", student: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `st-${run}`, email: `st-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `so-${run}`, email: `so-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.student = h.tokenFor({ id: `ss-${run}`, email: `ss-${run}@t.it`, role: "studente", name: "Anna" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Sim " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`st-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`so-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '5S', '5ª Superiore', 'Prof', ${`S${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`ss-${run}`}, ${"Anna " + run})`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"Leopardi " + run}, 'Italiano', '5ª Superiore', 'L''infinito: sempre caro mi fu quest''ermo colle.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM diagnosis_items WHERE class_id = ${ids.cls}`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("nasce con la traccia nel formato ministeriale e la griglia ufficiale gia' in vigore", async () => {
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() => "TIPOLOGIA A\nTesto: L'infinito.\nComprensione e analisi\n1. ...\nInterpretazione\n...");
    const res = await h.api(`/materials/${ids.material}/written-exams`, { method: "POST", token: tokens.teacher, json: { examType: "prima_prova_a" } });
    expect(res.status).toBe(201);
    const exam = (await res.json()) as { id: number; rubric: Array<{ name: string; weight: number }>; rubricStatus: string };
    ids.exam = exam.id;
    expect(exam.rubricStatus).toBe("approvata");
    expect(exam.rubric).toHaveLength(7);
    expect(exam.rubric.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    const sent = JSON.stringify(h.anthropicRequests.slice(before));
    expect(sent).toContain("TIPOLOGIA A");
    expect(sent).toContain("Non inventare citazioni");

    const mine = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student })).json()) as Array<{ id: number; rubric: unknown[] | null }>;
    expect(mine.find((e) => e.id === ids.exam)?.rubric).toHaveLength(7);
  });

  it("un formato sconosciuto viene rifiutato", async () => {
    const res = await h.api(`/materials/${ids.material}/written-exams`, { method: "POST", token: tokens.teacher, json: { examType: "prima_prova_z" } });
    expect(res.status).toBe(400);
  });

  it("il docente corregge la traccia; un estraneo no", async () => {
    const body = { prompt: "TIPOLOGIA A, traccia riletta dal docente con il testo corretto." };
    expect((await h.api(`/written-exams/${ids.exam}/prompt`, { method: "PUT", token: tokens.other, json: body })).status).toBe(404);
    expect((await h.api(`/written-exams/${ids.exam}/prompt`, { method: "PUT", token: tokens.teacher, json: { prompt: "corta" } })).status).toBe(400);
    expect((await h.api(`/written-exams/${ids.exam}/prompt`, { method: "PUT", token: tokens.teacher, json: body })).status).toBe(200);
    const mine = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student })).json()) as Array<{ id: number; prompt: string }>;
    expect(mine.find((e) => e.id === ids.exam)?.prompt).toBe(body.prompt);
  });

  it("dopo la prima consegna la traccia non si tocca piu'", async () => {
    h.anthropicReplies(() => JSON.stringify({ grade: 7, feedback: "Buona analisi.", rubricScores: [], diagnosis: [] }));
    const submit = await h.api(`/written-exams/${ids.exam}/submit`, { method: "POST", token: tokens.student, json: { studentAnswer: "Il mio svolgimento." } });
    expect(submit.status).toBe(201);
    const res = await h.api(`/written-exams/${ids.exam}/prompt`, { method: "PUT", token: tokens.teacher, json: { prompt: "Una traccia cambiata a consegne avvenute." } });
    expect(res.status).toBe(409);
  });
});
