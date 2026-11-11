import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Verifica di riscontro e metriche", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const className = `Segreta-${run}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, exam: 0, anna: 0, bruno: 0, alg07: 0, set: 0, followup: 0 };
  const tokens: Record<string, string> = {};
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  async function submitAndSign(examId: number, who: string, diagnosis: unknown[], grade: number) {
    h.anthropicReplies(() => JSON.stringify({ grade, feedback: "ok", diagnosis }));
    const res = await h.api(`/written-exams/${examId}/submit`, { method: "POST", token: tokens[who], json: { studentAnswer: "svolgimento" } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    expect((await h.api(`/written-submissions/${id}/validate`, { method: "POST", token: tokens.teacher, json: { grade, feedback: "ok", diagnosis: [] } })).status).toBe(200);
  }

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `ft-${run}`, email: "a@t.it", role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `fo-${run}`, email: "b@t.it", role: "docente", name: "Altro" });
    tokens.anna = h.tokenFor({ id: `fa-${run}`, email: "c@t.it", role: "studente", name: "Anna" });
    tokens.bruno = h.tokenFor({ id: `fb-${run}`, email: "d@t.it", role: "studente", name: "Bruno" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Fol " + run}, 'T') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ft-${run}`}, 'Prof', 'a@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`fo-${run}`}, 'Altro', 'b@t.it') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES (${ids.institution}, ${ids.teacher}, 'amministratore')`);
    ids.cls = (await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
      VALUES (${ids.institution}, ${ids.teacher}, ${className}, '1ª Superiore', 'Prof', ${`F${run.slice(-7)}`}) RETURNING id`)).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    ids.anna = (await one<{ id: number }>(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`fa-${run}`}, ${"Anna " + run}) RETURNING id`)).id;
    ids.bruno = (await one<{ id: number }>(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`fb-${run}`}, ${"Bruno " + run}) RETURNING id`)).id;
    ids.material = (await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
      VALUES (${ids.teacher}, ${"F " + run}, 'Matematica', '1ª Superiore', 'Disequazioni.') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    ids.exam = (await one<{ id: number }>(sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id)
      VALUES (${ids.material}, 'problema', 'Verifica iniziale', ${ids.teacher}) RETURNING id`)).id;
    ids.alg07 = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.07'`)).id;

    await submitAndSign(ids.exam, "anna", [{ exercise: "1", objectiveCode: "MAT1.ALG.07", outcome: "errato", errorType: "concettuale", evidence: "" }], 5);
    await submitAndSign(ids.exam, "bruno", [{ exercise: "1", objectiveCode: "MAT1.ALG.07", outcome: "corretto", errorType: null, evidence: "" }], 8);

    const { sets } = (await (await h.api("/recovery-sets", { token: tokens.teacher })).json()) as { sets: Array<{ id: number; objectives: Array<{ id: number }> }> };
    ids.set = sets[0].id;
    await h.api(`/recovery-sets/${ids.set}/questions`, { method: "POST", token: tokens.teacher, json: { objectiveId: ids.alg07, question: "Risolvi -2x > 6", answer: "x < -3" } });
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM diagnosis_items WHERE class_id = ${ids.cls}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("il riscontro si prepara solo dopo l'approvazione, in bozza, senza dati degli studenti", async () => {
    expect((await h.api(`/recovery-sets/${ids.set}/followup-draft`, { method: "POST", token: tokens.teacher })).status).toBe(409);
    expect((await h.api(`/recovery-sets/${ids.set}/approve`, { method: "POST", token: tokens.teacher, json: {} })).status).toBe(200);

    h.anthropicReplies(() => JSON.stringify({ prompt: "1) Risolvi la disequazione 4 - 3x < 10 e rappresenta le soluzioni." }));
    const res = await h.api(`/recovery-sets/${ids.set}/followup-draft`, { method: "POST", token: tokens.teacher });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { draft: string }).draft).toContain("4 - 3x < 10");
    const sent = JSON.stringify(h.anthropicRequests.at(-1));
    expect(sent).toContain("MAT1.ALG.07");
    expect(sent).not.toContain("Anna");
    // La bozza non assegna nulla.
    const exams = await one<{ n: string }>(sql`SELECT count(*)::text AS n FROM written_exams WHERE recovery_set_id = ${ids.set}`);
    expect(exams.n).toBe("0");
    expect((await h.api(`/recovery-sets/${ids.set}/followup-draft`, { method: "POST", token: tokens.other })).status).toBe(404);
  });

  it("il docente la assegna col proprio testo, e la vede solo chi ha fatto il recupero", async () => {
    const res = await h.api(`/recovery-sets/${ids.set}/followup`, { method: "POST", token: tokens.teacher, json: { prompt: "1) Risolvi 5 - 2x < 11 e rappresenta le soluzioni sulla retta." } });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { examId: number; recipients: number };
    ids.followup = body.examId;
    expect(body.recipients).toBe(1);
    expect((await h.api(`/recovery-sets/${ids.set}/followup`, { method: "POST", token: tokens.teacher, json: { prompt: "Un secondo riscontro non si assegna." } })).status).toBe(409);

    const forAnna = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.anna })).json()) as Array<{ id: number; isFollowup: boolean }>;
    expect(forAnna.find((e) => e.id === ids.followup)?.isFollowup).toBe(true);
    const forBruno = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.bruno })).json()) as Array<{ id: number }>;
    expect(forBruno.some((e) => e.id === ids.followup)).toBe(false);
    expect((await h.api(`/written-exams/${ids.followup}/submit`, { method: "POST", token: tokens.bruno, json: { studentAnswer: "x" } })).status).toBe(404);

    const notices = (await (await h.api("/me/notices", { token: tokens.anna })).json()) as { notices: Array<{ kind: string }> };
    expect(notices.notices.some((n) => n.kind === "riscontro")).toBe(true);
  });

  it("un riscontro riuscito e firmato porta l'obiettivo ad acquisito", async () => {
    await submitAndSign(ids.followup, "anna", [{ exercise: "1", objectiveCode: "MAT1.ALG.07", outcome: "corretto", errorType: null, evidence: "" }], 8);
    // Gli obiettivi del recupero erano in testa ai candidati inviati al modello.
    const sent = JSON.stringify(h.anthropicRequests.at(-1)?.messages ?? []);
    expect(sent.indexOf("MAT1.ALG.07")).toBeLessThan(sent.indexOf("MAT1.ARI.01"));

    const { mastery } = (await (await h.api(`/students/${ids.anna}/mastery`, { token: tokens.teacher })).json()) as { mastery: Array<{ objective: { code: string }; state: string; signed: { correct: number; total: number } }> };
    expect(mastery.find((m) => m.objective.code === "MAT1.ALG.07")).toMatchObject({ state: "acquisito", signed: { correct: 1, total: 2 } });
  });

  it("le metriche aggregano recupero, tempo, variazione e partecipazione, senza studenti", async () => {
    const item = await one<{ id: number }>(sql`UPDATE recovery_items SET due_date = CURRENT_DATE WHERE recovery_set_id = ${ids.set} AND round = 1 RETURNING id`);
    await h.api(`/recovery-items/${item.id}/complete`, { method: "POST", token: tokens.anna, json: { knewIt: true } });

    const res = await h.api(`/institutions/${ids.institution}/recovery-metrics`, { token: tokens.teacher });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("Anna");
    const report = JSON.parse(text) as { scope: string; totals: Record<string, number | null>; classes: Array<{ className: string }>; sets: Array<Record<string, unknown>> };
    expect(report.scope).toBe("istituto");
    expect(report.sets).toHaveLength(1);
    expect(report.sets[0]).toMatchObject({
      className, students: 1, gaps: 1, gapsAssessed: 1, gapsRecovered: 1, recoveredPercent: 100,
      initialGrade: 5, followupGrade: 8, gradeDelta: 3, itemsDue: 1, itemsDone: 1, participationPercent: 100, studentsActive: 1,
    });
    expect(report.sets[0].avgRecoveryDays).toBeGreaterThanOrEqual(0);
    expect(report.totals).toMatchObject({ sets: 1, gaps: 1, recoveredPercent: 100, gradeDelta: 3, participationPercent: 100 });

    expect((await h.api(`/institutions/${ids.institution}/recovery-metrics`, { token: tokens.other })).status).toBe(404);
    expect((await h.api(`/institutions/${ids.institution}/recovery-metrics`, { token: tokens.anna })).status).toBe(403);
  });

  it("l'export CSV e' anonimizzabile: niente nomi di istituto, classi o recuperi", async () => {
    const res = await h.api(`/institutions/${ids.institution}/recovery-metrics/export?anonymize=1`, { token: tokens.teacher });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Quota recuperati %");
    expect(lines[1].startsWith("Istituto;Classe A;Recupero 1;")).toBe(true);
    expect(csv).not.toContain(className);
    expect(csv).not.toContain(run);

    const plain = await (await h.api(`/institutions/${ids.institution}/recovery-metrics/export`, { token: tokens.teacher })).text();
    expect(plain).toContain(className);
  });
});
