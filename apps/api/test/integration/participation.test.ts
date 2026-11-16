import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** Segnali di partecipazione: chi ha aperto il materiale e chi ha consegnato, solo per i docenti della classe. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Partecipazione su un materiale", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, exam: 0 };
  const tokens = { teacher: "", other: "", anna: "", bruno: "", outsider: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  type P = {
    classes: Array<{ total: number; opened: number; notOpened: string[] }>;
    assignments: Array<{ id: number; expected: number; submitted: number; missing: Array<{ name: string }> }>;
  };
  const participation = async () => {
    const res = await h.api(`/materials/${ids.material}/participation`, { token: tokens.teacher });
    expect(res.status).toBe(200);
    return (await res.json()) as P;
  };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `pt-${run}`, email: `pt-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `po-${run}`, email: `po-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.anna = h.tokenFor({ id: `pa-${run}`, email: `pa-${run}@t.it`, role: "studente", name: "Anna" });
    tokens.bruno = h.tokenFor({ id: `pb-${run}`, email: `pb-${run}@t.it`, role: "studente", name: "Bruno" });
    tokens.outsider = h.tokenFor({ id: `px-${run}`, email: `px-${run}@t.it`, role: "studente", name: "Fuori" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Par " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`pt-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`po-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '1P', '1ª Superiore', 'Prof', ${`P${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    // Anna e Bruno hanno un account; Carla e' in elenco ma non si e' ancora iscritta.
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES
      (${ids.cls}, ${`pa-${run}`}, 'Anna'), (${ids.cls}, ${`pb-${run}`}, 'Bruno'), (${ids.cls}, NULL, 'Carla')`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"Mat " + run}, 'Matematica', '1ª Superiore', 'Contenuto.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    ids.exam = (
      await one<{ id: number }>(sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id, status)
        VALUES (${ids.material}, 'problema', 'Traccia', ${ids.teacher}, 'assegnato') RETURNING id`)
    ).id;
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("RLS abilitata; un docente estraneo e uno studente non vedono nulla", async () => {
    const row = await one<{ relrowsecurity: boolean }>(sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'material_views'`);
    expect(row.relrowsecurity).toBe(true);
    expect((await h.api(`/materials/${ids.material}/participation`, { token: tokens.other })).status).toBe(404);
    expect((await h.api(`/materials/${ids.material}/participation`, { token: tokens.anna })).status).toBe(403);
  });

  it("all'inizio nessuno l'ha aperto; chi non ha un account non risulta 'mancante' nelle consegne", async () => {
    const p = await participation();
    expect(p.classes[0]).toMatchObject({ total: 3, opened: 0, notOpened: ["Anna", "Bruno", "Carla"] });
    expect(p.assignments[0]).toMatchObject({ expected: 2, submitted: 0 });
    expect(p.assignments[0].missing.map((m) => m.name)).toEqual(["Anna", "Bruno"]);
  });

  it("l'apertura dello studente viene annotata una volta; quella del docente e di un estraneo no", async () => {
    expect((await h.api(`/materials/${ids.material}`, { token: tokens.anna })).status).toBe(200);
    expect((await h.api(`/materials/${ids.material}`, { token: tokens.anna })).status).toBe(200);
    await h.api(`/materials/${ids.material}`, { token: tokens.teacher });
    await h.api(`/materials/${ids.material}`, { token: tokens.outsider });
    // L'annotazione avviene subito dopo la risposta: un attimo di margine.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const rows = await one<{ n: string }>(sql`SELECT count(*) AS n FROM material_views WHERE material_id = ${ids.material}`);
    expect(Number(rows.n)).toBe(1);
    const p = await participation();
    expect(p.classes[0]).toMatchObject({ opened: 1, notOpened: ["Bruno", "Carla"] });
  });

  it("chi consegna esce dall'elenco dei mancanti", async () => {
    h.anthropicReplies(() => JSON.stringify({ grade: 7, feedback: "ok", diagnosis: [] }));
    const res = await h.api(`/written-exams/${ids.exam}/submit`, { method: "POST", token: tokens.bruno, json: { studentAnswer: "svolto" } });
    expect(res.status).toBe(201);
    const p = await participation();
    expect(p.assignments[0]).toMatchObject({ expected: 2, submitted: 1 });
    expect(p.assignments[0].missing.map((m) => m.name)).toEqual(["Anna"]);
  });
});
