import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** Prove in stile INVALSI: bozza dell'assistente, pubblicazione del docente, correzione automatica, nessun voto. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Allenamento INVALSI", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, test: 0 };
  const tokens = { teacher: "", other: "", anna: "", bruno: "", outsider: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  const count = async (table: string) => Number((await one<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))).n);
  const item = (n: number, correctIndex: number) => ({
    question: `Quanto fa ${n} + ${n}?`,
    options: [`${2 * n}`, `${2 * n + 1}`, `${n}`, `${n * n + 7}`],
    correctIndex,
    explanation: `Si somma ${n} a se stesso.`,
    area: "Numeri",
  });
  type Detail = { id: number; status: string; items: Array<{ id: number; correctIndex: number }>; results: null | { completed: number; averagePercent: number | null; students: Array<{ name: string; score: number }>; items: Array<{ id: number; correct: number }> } };
  const detail = async () => {
    const res = await h.api(`/classes/${ids.cls}/invalsi-tests`, { token: tokens.teacher });
    return ((await res.json()) as { tests: Detail[] }).tests.find((t) => t.id === ids.test)!;
  };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `it-${run}`, email: `it-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `io-${run}`, email: `io-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.anna = h.tokenFor({ id: `ia-${run}`, email: `ia-${run}@t.it`, role: "studente", name: "Anna" });
    tokens.bruno = h.tokenFor({ id: `ib-${run}`, email: `ib-${run}@t.it`, role: "studente", name: "Bruno" });
    tokens.outsider = h.tokenFor({ id: `ix-${run}`, email: `ix-${run}@t.it`, role: "studente", name: "Fuori" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Inv " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`it-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`io-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '2I', '2ª Superiore', 'Prof', ${`I${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`ia-${run}`}, ${"Anna " + run}), (${ids.cls}, ${`ib-${run}`}, ${"Bruno " + run})`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("RLS abilitata sulle tre tabelle", async () => {
    const rows = (await db.execute(sql`SELECT relrowsecurity FROM pg_class WHERE relname LIKE 'invalsi_%' AND relkind = 'r'`)).rows as Array<{ relrowsecurity: boolean }>;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("la proposta nasce in bozza, senza dati della classe al modello; i quesiti malformati cadono", async () => {
    const body = { subject: "Matematica", gradeLevel: "2ª Superiore", count: 5 };
    expect((await h.api(`/classes/${ids.cls}/invalsi-tests`, { method: "POST", token: tokens.other, json: body })).status).toBe(404);
    expect((await h.api(`/classes/${ids.cls}/invalsi-tests`, { method: "POST", token: tokens.teacher, json: { ...body, subject: "Storia" } })).status).toBe(400);

    const before = h.anthropicRequests.length;
    h.anthropicReplies(() =>
      JSON.stringify({ title: "Numeri e operazioni", passage: "testo che per matematica va ignorato", items: [item(1, 0), item(2, 0), item(3, 0), item(4, 0), { question: "rotto", options: ["a"], correctIndex: 0 }] }),
    );
    const res = await h.api(`/classes/${ids.cls}/invalsi-tests`, { method: "POST", token: tokens.teacher, json: body });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Detail & { passage: string | null };
    ids.test = created.id;
    expect(created.status).toBe("bozza");
    expect(created.items).toHaveLength(4);
    expect(created.passage).toBeNull();
    const sent = JSON.stringify(h.anthropicRequests.slice(before));
    expect(sent).not.toContain("Anna");
    expect(sent).toContain("Non riprodurre quesiti di prove ufficiali");
  });

  it("in bozza gli studenti non la vedono e non si pubblica con meno di cinque quesiti", async () => {
    expect(((await (await h.api(`/me/invalsi-tests`, { token: tokens.anna })).json()) as { tests: unknown[] }).tests).toEqual([]);
    expect((await h.api(`/invalsi-tests/${ids.test}/take`, { token: tokens.anna })).status).toBe(404);
    expect((await h.api(`/invalsi-tests/${ids.test}/publish`, { method: "POST", token: tokens.teacher })).status).toBe(400);
  });

  it("il docente corregge e aggiunge quesiti, poi pubblica; un estraneo no", async () => {
    const d = await detail();
    expect((await h.api(`/invalsi-items/${d.items[0].id}`, { method: "PATCH", token: tokens.other, json: item(9, 1) })).status).toBe(404);
    expect((await h.api(`/invalsi-items/${d.items[0].id}`, { method: "PATCH", token: tokens.teacher, json: { ...item(9, 1), options: ["a", "a", "b", "c"].slice(0, 3) } })).status).toBe(400);
    expect((await h.api(`/invalsi-items/${d.items[0].id}`, { method: "PATCH", token: tokens.teacher, json: item(9, 1) })).status).toBe(200);
    expect((await h.api(`/invalsi-tests/${ids.test}/items`, { method: "POST", token: tokens.teacher, json: item(5, 0) })).status).toBe(201);
    expect((await h.api(`/invalsi-tests/${ids.test}/publish`, { method: "POST", token: tokens.other })).status).toBe(404);
    const pub = await h.api(`/invalsi-tests/${ids.test}/publish`, { method: "POST", token: tokens.teacher });
    expect(pub.status).toBe(200);
    expect((await h.api(`/invalsi-items/${d.items[1].id}`, { method: "DELETE", token: tokens.teacher })).status).toBe(409);
  });

  it("prima della consegna le risposte giuste non escono; chi e' fuori classe non entra", async () => {
    expect((await h.api(`/invalsi-tests/${ids.test}/take`, { token: tokens.outsider })).status).toBe(404);
    const res = await h.api(`/invalsi-tests/${ids.test}/take`, { token: tokens.anna });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("correctIndex");
    expect(text).not.toContain("Si somma");
    const agenda = (await (await h.api(`/me/agenda`, { token: tokens.anna })).json()) as { items: Array<{ kind: string; link: string }> };
    expect(agenda.items).toContainEqual(expect.objectContaining({ kind: "prova", link: `/studio/prova/${ids.test}` }));
  });

  it("la consegna e' corretta in automatico, una volta sola, senza creare voti", async () => {
    const d = await detail();
    const mastery = await count("mastery_events");
    const allRight = Object.fromEntries(d.items.map((i) => [String(i.id), i.correctIndex]));
    const anna = await h.api(`/invalsi-tests/${ids.test}/submit`, { method: "POST", token: tokens.anna, json: { answers: allRight } });
    expect(anna.status).toBe(201);
    expect((await anna.json()) as { score: number; total: number }).toMatchObject({ score: 5, total: 5 });
    expect((await h.api(`/invalsi-tests/${ids.test}/submit`, { method: "POST", token: tokens.anna, json: { answers: {} } })).status).toBe(409);

    const oneRight = { [String(d.items[0].id)]: d.items[0].correctIndex, [String(d.items[1].id)]: (d.items[1].correctIndex + 1) % 4, "999999": 0 };
    const bruno = await h.api(`/invalsi-tests/${ids.test}/submit`, { method: "POST", token: tokens.bruno, json: { answers: oneRight } });
    expect((await bruno.json()) as { score: number }).toMatchObject({ score: 1 });
    expect(await count("mastery_events")).toBe(mastery);

    const after = (await (await h.api(`/invalsi-tests/${ids.test}/take`, { token: tokens.bruno })).json()) as { done: boolean; items: Array<{ correctIndex: number; explanation: string }> };
    expect(after.done).toBe(true);
    expect(after.items[0].explanation).toBeTruthy();
    const agenda = (await (await h.api(`/me/agenda`, { token: tokens.bruno })).json()) as { items: Array<{ kind: string }> };
    expect(agenda.items.some((i) => i.kind === "prova")).toBe(false);
  });

  it("il docente vede i risultati per quesito e per studente", async () => {
    const d = await detail();
    expect(d.results).toMatchObject({ completed: 2, averagePercent: 60 });
    expect(d.results!.students.map((s) => s.score)).toEqual([5, 1]);
    expect(d.results!.items[0].correct).toBe(2);
    expect((await h.api(`/classes/${ids.cls}/invalsi-tests`, { token: tokens.other })).status).toBe(404);
  });
});
