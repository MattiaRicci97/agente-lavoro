import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Firma -> profilo di padronanza -> bozza di recupero -> approvazione ->
 * richiami distanziati -> autovalutazione. E, lungo tutto il percorso, la
 * pratica non lascia traccia nel registro.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Padronanza e recupero", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, exam: 0, anna: 0, bruno: 0, alg05: 0, alg07: 0, set: 0 };
  const tokens = { teacher: "", other: "", anna: "", bruno: "" };
  const sub = { anna: 0, bruno: 0 };

  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  const all = async <T,>(q: ReturnType<typeof sql>): Promise<T[]> => (await db.execute(q)).rows as T[];
  const today = () => new Date().toISOString().slice(0, 10);
  const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  async function submitAndSign(who: "anna" | "bruno", diagnosis: unknown[], grade: number) {
    h.anthropicReplies(() => JSON.stringify({ grade, feedback: "ok", diagnosis }));
    const res = await h.api(`/written-exams/${ids.exam}/submit`, { method: "POST", token: tokens[who], json: { studentAnswer: "svolgimento" } });
    expect(res.status).toBe(201);
    sub[who] = ((await res.json()) as { id: number }).id;
    const signed = await h.api(`/written-submissions/${sub[who]}/validate`, { method: "POST", token: tokens.teacher, json: { grade, feedback: "ok", diagnosis: [] } });
    expect(signed.status).toBe(200);
  }

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `rt-${run}`, email: `rt-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `ro-${run}`, email: `ro-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.anna = h.tokenFor({ id: `ra-${run}`, email: `ra-${run}@t.it`, role: "studente", name: "Anna" });
    tokens.bruno = h.tokenFor({ id: `rb-${run}`, email: `rb-${run}@t.it`, role: "studente", name: "Bruno" });

    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Rec " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`rt-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ro-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id) VALUES (${ids.institution}, ${ids.teacher})`);
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '1R', '1ª Superiore', 'Prof', ${`R${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    ids.anna = (await one<{ id: number }>(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`ra-${run}`}, ${"Anna " + run}) RETURNING id`)).id;
    ids.bruno = (await one<{ id: number }>(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`rb-${run}`}, ${"Bruno " + run}) RETURNING id`)).id;
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"Eq " + run}, 'Matematica', '1ª Superiore', 'Equazioni e disequazioni.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    ids.exam = (
      await one<{ id: number }>(sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id)
        VALUES (${ids.material}, 'problema', 'Tre esercizi', ${ids.teacher}) RETURNING id`)
    ).id;
    ids.alg05 = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.05'`)).id;
    ids.alg07 = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.07'`)).id;
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM diagnosis_items WHERE class_id = ${ids.cls}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("RLS e' abilitata sulle tabelle di padronanza e recupero", async () => {
    const rows = await all<{ relrowsecurity: boolean }>(sql`
      SELECT relrowsecurity FROM pg_class WHERE relname IN
      ('mastery_events','mastery_states','recovery_sets','recovery_set_sources','recovery_questions','recovery_items','student_notices','diagnosis_items')`);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("la firma porta la diagnosi nel profilo: acquisito, fragile, mancante per obiettivo", async () => {
    // Anna: equazioni una giusta e una in parte -> fragile; disequazioni sbagliate -> mancante.
    await submitAndSign("anna", [
      { exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "" },
      { exercise: "Es. 2", objectiveCode: "MAT1.ALG.05", outcome: "parziale", errorType: "procedurale", evidence: "" },
      { exercise: "Es. 3", objectiveCode: "MAT1.ALG.07", outcome: "errato", errorType: "concettuale", evidence: "" },
    ], 6);
    // Bruno: equazioni giuste -> acquisito; disequazioni sbagliate -> mancante.
    await submitAndSign("bruno", [
      { exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "" },
      { exercise: "Es. 3", objectiveCode: "MAT1.ALG.07", outcome: "errato", errorType: "concettuale", evidence: "" },
    ], 7);

    const res = await h.api(`/students/${ids.anna}/mastery`, { token: tokens.teacher });
    expect(res.status).toBe(200);
    const { mastery } = (await res.json()) as { mastery: Array<{ objective: { code: string }; state: string; signed: { correct: number; total: number } }> };
    const byCode = new Map(mastery.map((m) => [m.objective.code, m]));
    expect(byCode.get("MAT1.ALG.05")).toMatchObject({ state: "fragile", signed: { correct: 1, total: 2 } });
    expect(byCode.get("MAT1.ALG.07")).toMatchObject({ state: "mancante", signed: { correct: 0, total: 1 } });

    const bruno = (await (await h.api(`/students/${ids.bruno}/mastery`, { token: tokens.teacher })).json()) as { mastery: Array<{ objective: { code: string }; state: string }> };
    expect(bruno.mastery.find((m) => m.objective.code === "MAT1.ALG.05")?.state).toBe("acquisito");

    expect((await h.api(`/students/${ids.anna}/mastery`, { token: tokens.other })).status).toBe(404);

    // Firmare due volte non raddoppia le evidenze.
    await h.api(`/written-submissions/${sub.anna}/validate`, { method: "POST", token: tokens.teacher, json: { grade: 6, feedback: "ok", diagnosis: [] } });
    const n = await one<{ n: string }>(sql`SELECT count(*)::text AS n FROM mastery_events WHERE student_id = ${ids.anna}`);
    expect(n.n).toBe("3");
  });

  it("nasce UNA bozza di recupero per la classe, e finche' e' bozza nessuno studente riceve nulla", async () => {
    const res = await h.api("/recovery-sets", { token: tokens.teacher });
    const { sets } = (await res.json()) as { sets: Array<{ id: number; status: string; studentsCount: number; objectives: Array<{ code: string; studentsCount: number; errorTypes: Record<string, number>; questions: unknown[] }> }> };
    expect(sets).toHaveLength(1);
    ids.set = sets[0].id;
    expect(sets[0]).toMatchObject({ status: "bozza", studentsCount: 2 });
    const byCode = new Map(sets[0].objectives.map((o) => [o.code, o]));
    expect(byCode.get("MAT1.ALG.05")).toMatchObject({ studentsCount: 1, errorTypes: { procedurale: 1 } });
    expect(byCode.get("MAT1.ALG.07")).toMatchObject({ studentsCount: 2, errorTypes: { concettuale: 2 } });

    expect(((await (await h.api("/recovery-sets", { token: tokens.other })).json()) as { sets: unknown[] }).sets).toHaveLength(0);

    const mine = (await (await h.api("/me/recovery", { token: tokens.anna })).json()) as { due: unknown[]; nextDueDate: string | null };
    expect(mine).toEqual({ due: [], nextDueDate: null });
    const notices = (await (await h.api("/me/notices", { token: tokens.anna })).json()) as { notices: unknown[] };
    expect(notices.notices).toHaveLength(0);

    // Senza domande non si approva.
    const early = await h.api(`/recovery-sets/${ids.set}/approve`, { method: "POST", token: tokens.teacher, json: {} });
    expect(early.status).toBe(409);
  });

  it("l'assistente propone le domande senza ricevere dati degli studenti; il docente le corregge", async () => {
    h.anthropicReplies(() =>
      JSON.stringify({
        questions: [
          { objectiveCode: "MAT1.ALG.05", question: "Risolvi 3x - 2 = 7", answer: "x = 3" },
          { objectiveCode: "MAT1.ALG.05", question: "Risolvi x/3 + 1 = 4", answer: "x = 9" },
          { objectiveCode: "MAT1.ALG.07", question: "Risolvi -2x > 6", answer: "x < -3: dividendo per un negativo il verso si inverte" },
          { objectiveCode: "FUORI", question: "Domanda su altro tema", answer: "..." },
        ],
      }),
    );
    const gen = await h.api(`/recovery-sets/${ids.set}/generate`, { method: "POST", token: tokens.teacher });
    expect(gen.status).toBe(200);
    const detail = (await gen.json()) as { objectives: Array<{ id: number; code: string; questions: Array<{ id: number; authorType: string }> }> };
    const alg05 = detail.objectives.find((o) => o.code === "MAT1.ALG.05")!;
    const alg07 = detail.objectives.find((o) => o.code === "MAT1.ALG.07")!;
    expect(alg05.questions).toHaveLength(2);
    expect(alg07.questions).toHaveLength(1);

    const sent = JSON.stringify(h.anthropicRequests.at(-1));
    expect(sent).toContain("MAT1.ALG.07");
    expect(sent).toContain("il concetto non e' chiaro");
    expect(sent).not.toContain("Anna");
    expect(sent).not.toContain("Bruno");

    const edit = await h.api(`/recovery-questions/${alg07.questions[0].id}`, { method: "PATCH", token: tokens.teacher, json: { question: "Risolvi -3x > 9", answer: "x < -3" } });
    expect(edit.status).toBe(200);
    const add = await h.api(`/recovery-sets/${ids.set}/questions`, { method: "POST", token: tokens.teacher, json: { objectiveId: alg07.id, question: "Risolvi 5 - x < 2", answer: "x > 3" } });
    expect(add.status).toBe(201);

    expect((await h.api(`/recovery-questions/${alg07.questions[0].id}`, { method: "PATCH", token: tokens.other, json: { question: "Dirottata!", answer: "x" } })).status).toBe(404);
    expect((await h.api(`/recovery-sets/${ids.set}/approve`, { method: "POST", token: tokens.other, json: {} })).status).toBe(404);
    expect((await h.api(`/recovery-sets/${ids.set}/approve`, { method: "POST", token: tokens.teacher, json: { intervalsDays: [7, 2] } })).status).toBe(400);
  });

  it("l'approvazione distribuisce a ciascuno i propri obiettivi, a 2, 7 e 21 giorni, e avvisa", async () => {
    const res = await h.api(`/recovery-sets/${ids.set}/approve`, { method: "POST", token: tokens.teacher, json: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; distributed: { students: number; items: number } };
    // Anna: 2 obiettivi x 3 giri; Bruno: 1 obiettivo x 3 giri.
    expect(body).toMatchObject({ status: "approvato", distributed: { students: 2, items: 9 } });

    const anna = await all<{ objective_id: number; round: number; due_date: string }>(sql`
      SELECT objective_id, round, due_date::text FROM recovery_items WHERE student_id = ${ids.anna} ORDER BY objective_id, round`);
    expect(anna).toHaveLength(6);
    expect(anna.filter((i) => i.objective_id === ids.alg05).map((i) => i.due_date)).toEqual([plusDays(2), plusDays(7), plusDays(21)]);
    const bruno = await all<{ objective_id: number }>(sql`SELECT DISTINCT objective_id FROM recovery_items WHERE student_id = ${ids.bruno}`);
    expect(bruno).toEqual([{ objective_id: ids.alg07 }]);

    // Giri diversi, domande diverse (finche' ce ne sono).
    const qs = await all<{ question_id: number }>(sql`SELECT question_id FROM recovery_items WHERE student_id = ${ids.bruno} ORDER BY round`);
    expect(new Set(qs.map((q) => q.question_id)).size).toBe(2);

    const notices = (await (await h.api("/me/notices", { token: tokens.anna })).json()) as { notices: Array<{ id: number; title: string; body: string }> };
    expect(notices.notices).toHaveLength(1);
    expect(notices.notices[0].body).toContain("Disequazioni di primo grado");
    expect((await h.api(`/me/notices/${notices.notices[0].id}/read`, { method: "POST", token: tokens.bruno })).status).toBe(404);
    expect((await h.api(`/me/notices/${notices.notices[0].id}/read`, { method: "POST", token: tokens.anna })).status).toBe(204);

    // Niente e' dovuto oggi: il primo richiamo e' tra due giorni.
    const mine = (await (await h.api("/me/recovery", { token: tokens.anna })).json()) as { due: unknown[]; nextDueDate: string };
    expect(mine.due).toHaveLength(0);
    expect(mine.nextDueDate).toBe(plusDays(2));

    // Approvare due volte non raddoppia; una bozza approvata non si elimina.
    expect((await h.api(`/recovery-sets/${ids.set}/approve`, { method: "POST", token: tokens.teacher, json: {} })).status).toBe(409);
    expect((await h.api(`/recovery-sets/${ids.set}`, { method: "DELETE", token: tokens.teacher })).status).toBe(409);
  });

  it("il richiamo e' pratica: aggiorna il profilo come autovalutazione e non tocca il registro", async () => {
    const registroBefore = await (await h.api(`/classes/${ids.cls}/registro`, { token: tokens.teacher })).text();

    const future = await one<{ id: number }>(sql`SELECT id FROM recovery_items WHERE student_id = ${ids.anna} AND objective_id = ${ids.alg07} AND round = 1`);
    // Non ancora dovuto: non si puo' chiudere in anticipo.
    expect((await h.api(`/recovery-items/${future.id}/complete`, { method: "POST", token: tokens.anna, json: { knewIt: true } })).status).toBe(404);

    await db.execute(sql`UPDATE recovery_items SET due_date = ${today()} WHERE id = ${future.id}`);
    const mine = (await (await h.api("/me/recovery", { token: tokens.anna })).json()) as { due: Array<{ id: number; objectiveTitle: string; question: string; answer: string }> };
    expect(mine.due).toHaveLength(1);
    expect(mine.due[0]).toMatchObject({ id: future.id, objectiveTitle: "Disequazioni di primo grado" });

    // Il richiamo di Anna non e' di Bruno.
    expect((await h.api(`/recovery-items/${future.id}/complete`, { method: "POST", token: tokens.bruno, json: { knewIt: true } })).status).toBe(404);
    const done = await h.api(`/recovery-items/${future.id}/complete`, { method: "POST", token: tokens.anna, json: { knewIt: true } });
    expect(done.status).toBe(200);
    // Ripetere non crea una seconda evidenza.
    await h.api(`/recovery-items/${future.id}/complete`, { method: "POST", token: tokens.anna, json: { knewIt: true } });

    const events = await all<{ source: string; outcome: string }>(sql`
      SELECT source, outcome FROM mastery_events WHERE student_id = ${ids.anna} AND objective_id = ${ids.alg07} ORDER BY id`);
    expect(events).toEqual([{ source: "firmato", outcome: "errato" }, { source: "autovalutazione", outcome: "corretto" }]);

    // Da mancante a fragile: la pratica muove il profilo ma non certifica.
    const own = (await (await h.api("/me/mastery", { token: tokens.anna })).json()) as { mastery: Array<{ objective: { code: string }; state: string; practice: { correct: number; total: number } }> };
    expect(own.mastery.find((m) => m.objective.code === "MAT1.ALG.07")).toMatchObject({ state: "fragile", practice: { correct: 1, total: 1 } });

    // Il registro e' identico a prima: nessun voto e' nato dalla pratica.
    const registroAfter = await (await h.api(`/classes/${ids.cls}/registro`, { token: tokens.teacher })).text();
    expect(registroAfter).toBe(registroBefore);
    expect(registroAfter).toContain("Anna");

    const detail = (await (await h.api("/recovery-sets", { token: tokens.teacher })).json()) as { sets: Array<{ progress: { done: number; total: number } }> };
    expect(detail.sets[0].progress).toEqual({ done: 1, total: 9 });
  });
});
