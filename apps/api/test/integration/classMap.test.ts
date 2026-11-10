import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Mappa della classe", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, exam: 0, alg05: 0, alg07: 0 };
  const students: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `mt-${run}`, email: "a@t.it", role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `mo-${run}`, email: "b@t.it", role: "docente", name: "Altro" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Map " + run}, 'T') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`mt-${run}`}, 'Prof', 'a@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`mo-${run}`}, 'Altro', 'b@t.it') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id) VALUES (${ids.institution}, ${ids.teacher})`);
    ids.cls = (await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
      VALUES (${ids.institution}, ${ids.teacher}, '1M', '1ª Superiore', 'Prof', ${`M${run.slice(-7)}`}) RETURNING id`)).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    ids.material = (await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
      VALUES (${ids.teacher}, ${"M " + run}, 'Matematica', '1ª Superiore', 'Equazioni e disequazioni.') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    ids.exam = (await one<{ id: number }>(sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id)
      VALUES (${ids.material}, 'problema', 'Esercizi', ${ids.teacher}) RETURNING id`)).id;
    ids.alg05 = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.05'`)).id;
    ids.alg07 = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.07'`)).id;

    // Quattro studenti; tre consegnano. Sulle disequazioni: due errori concettuali, uno procedurale.
    const plan: Record<string, unknown[] | null> = {
      Zeno: null,
      Anna: [
        { exercise: "1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "" },
        { exercise: "2", objectiveCode: "MAT1.ALG.07", outcome: "errato", errorType: "concettuale", evidence: "" },
      ],
      Bruno: [
        { exercise: "1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "" },
        { exercise: "2", objectiveCode: "MAT1.ALG.07", outcome: "errato", errorType: "concettuale", evidence: "" },
        { exercise: "3", objectiveCode: "MAT1.ALG.07", outcome: "errato", errorType: "concettuale", evidence: "" },
      ],
      Carla: [
        { exercise: "1", objectiveCode: "MAT1.ALG.05", outcome: "parziale", errorType: "distrazione", evidence: "" },
        { exercise: "2", objectiveCode: "MAT1.ALG.07", outcome: "parziale", errorType: "procedurale", evidence: "" },
      ],
    };
    for (const [name, diagnosis] of Object.entries(plan)) {
      const authId = `ms-${name}-${run}`;
      tokens[name] = h.tokenFor({ id: authId, email: `${name}@t.it`, role: "studente", name });
      students[name] = (await one<{ id: number }>(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${authId}, ${`${name} ${run}`}) RETURNING id`)).id;
      if (!diagnosis) continue;
      h.anthropicReplies(() => JSON.stringify({ grade: 6, feedback: "ok", diagnosis }));
      const res = await h.api(`/written-exams/${ids.exam}/submit`, { method: "POST", token: tokens[name], json: { studentAnswer: "x" } });
      const { id } = (await res.json()) as { id: number };
      await h.api(`/written-submissions/${id}/validate`, { method: "POST", token: tokens.teacher, json: { grade: 6, feedback: "ok", diagnosis: [] } });
    }
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM diagnosis_items WHERE class_id = ${ids.cls}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("mostra obiettivi x studenti, con conteggi, errori comuni in percentuale e gruppi", async () => {
    const res = await h.api(`/classes/${ids.cls}/mastery-map`, { token: tokens.teacher });
    expect(res.status).toBe(200);
    const map = (await res.json()) as {
      subjects: string[];
      students: Array<{ id: number }>;
      objectives: Array<{ code: string; counts: Record<string, number>; assessed: number; commonErrors: Array<{ errorType: string; students: number; percent: number }>; groupStudentIds: number[] }>;
      cells: Record<string, Record<string, string>>;
    };
    expect(map.subjects).toEqual(["Matematica"]);
    expect(map.students).toHaveLength(4);
    const alg05 = map.objectives.find((o) => o.code === "MAT1.ALG.05")!;
    const alg07 = map.objectives.find((o) => o.code === "MAT1.ALG.07")!;
    expect(alg05.counts).toEqual({ acquisito: 2, fragile: 1, mancante: 0, inEsercizio: 0 });
    expect(alg07.counts).toEqual({ acquisito: 0, fragile: 1, mancante: 2, inEsercizio: 0 });
    expect(alg07.assessed).toBe(3);
    // Bruno ha sbagliato due esercizi, ma conta come uno studente.
    expect(alg07.commonErrors).toEqual([
      { errorType: "concettuale", students: 2, percent: 67 },
      { errorType: "procedurale", students: 1, percent: 33 },
    ]);
    expect([...alg07.groupStudentIds].sort()).toEqual([students.Anna, students.Bruno, students.Carla].sort());
    expect(alg05.groupStudentIds).toEqual([students.Carla]);
    expect(map.cells[students.Anna][ids.alg07]).toBe("mancante");
    expect(map.cells[students.Zeno]).toEqual({});
  });

  it("e' riservata ai docenti della classe", async () => {
    expect((await h.api(`/classes/${ids.cls}/mastery-map`, { token: tokens.other })).status).toBe(404);
    expect((await h.api(`/classes/${ids.cls}/mastery-map`, { token: tokens.Anna })).status).toBe(403);
    expect((await h.api(`/classes/${ids.cls}/objectives/${ids.alg07}/activity-draft`, { method: "POST", token: tokens.other })).status).toBe(404);
  });

  it("l'attivita' da dieci minuti nasce in bozza senza nomi nel prompt, e il testo del docente non viene sovrascritto", async () => {
    h.anthropicReplies(() => JSON.stringify({ title: "Il verso che si inverte", activity: "2 min: esempio alla lavagna. 5 min: a coppie tre disequazioni. 3 min: confronto." }));
    const res = await h.api(`/classes/${ids.cls}/objectives/${ids.alg07}/activity-draft`, { method: "POST", token: tokens.teacher });
    expect(res.status).toBe(200);
    const draft = (await res.json()) as { aiDraft: string; body: string };
    expect(draft.body).toContain("Il verso che si inverte");

    const sent = JSON.stringify(h.anthropicRequests.at(-1));
    expect(sent).toContain("Disequazioni di primo grado");
    expect(sent).toContain("il concetto non e' chiaro");
    expect(sent).toContain("Studenti che devono riprenderlo: 3");
    for (const name of ["Anna", "Bruno", "Carla", "Zeno"]) expect(sent).not.toContain(name);

    const saved = await h.api(`/classes/${ids.cls}/objectives/${ids.alg07}/activity`, { method: "PUT", token: tokens.teacher, json: { body: "La mia versione." } });
    expect(saved.status).toBe(200);
    h.anthropicReplies(() => JSON.stringify({ title: "Seconda proposta", activity: "Un'altra traccia di attivita' per la classe." }));
    const again = (await (await h.api(`/classes/${ids.cls}/objectives/${ids.alg07}/activity-draft`, { method: "POST", token: tokens.teacher })).json()) as { aiDraft: string; body: string };
    expect(again.body).toBe("La mia versione.");
    expect(again.aiDraft).toContain("Seconda proposta");

    const map = (await (await h.api(`/classes/${ids.cls}/mastery-map`, { token: tokens.teacher })).json()) as { objectives: Array<{ code: string; activity: { body: string } | null }> };
    expect(map.objectives.find((o) => o.code === "MAT1.ALG.07")?.activity?.body).toBe("La mia versione.");
    expect((await h.api(`/classes/${ids.cls}/objectives/${ids.alg07}/activity`, { method: "PUT", token: tokens.other, json: { body: "x" } })).status).toBe(404);
  });

  it("all'assistente del docente arrivano solo conteggi per obiettivo", async () => {
    h.anthropicReplies(() => "Riprenderei le disequazioni.");
    const res = await h.api("/assistant", { method: "POST", token: tokens.teacher, json: { question: "Cosa riprendo?" } });
    expect(res.status).toBe(200);
    const sent = JSON.stringify(h.anthropicRequests.at(-1));
    expect(sent).toContain("Disequazioni di primo grado: 0 acquisito, 1 fragile, 2 mancante");
  });
});
