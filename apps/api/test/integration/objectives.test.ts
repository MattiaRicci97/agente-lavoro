import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Test d'integrazione sulla mappa degli obiettivi e sui controlli di accesso.
 * Richiedono un Postgres gia' preparato con `drizzle-kit push` + `setup.ts`
 * (il seed del catalogo base deve esserci). Senza TEST_DATABASE_URL vengono saltati.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Mappa degli obiettivi e autorizzazioni", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = {
    institutionA: 0,
    institutionB: 0,
    teacherA: 0,
    teacherB: 0,
    classA: 0,
    classB: 0,
    materialA: 0,
    baseObjective: 0,
  };
  const tokens = { teacherA: "", teacherB: "", studentA: "", studentB: "" };
  const studentAName = `Alunno A ${run}`;
  const studentBName = `Alunno B ${run}`;

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));

    tokens.teacherA = h.tokenFor({ id: `ta-${run}`, email: `ta-${run}@test.it`, role: "docente", name: "Prof A" });
    tokens.teacherB = h.tokenFor({ id: `tb-${run}`, email: `tb-${run}@test.it`, role: "docente", name: "Prof B" });
    tokens.studentA = h.tokenFor({ id: `sa-${run}`, email: `sa-${run}@test.it`, role: "studente", name: studentAName });
    tokens.studentB = h.tokenFor({ id: `sb-${run}`, email: `sb-${run}@test.it`, role: "studente", name: studentBName });

    const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => {
      const res = await db.execute(q);
      return (res.rows as T[])[0];
    };

    ids.institutionA = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Ist A " + run}, 'Test') RETURNING id`)).id;
    ids.institutionB = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Ist B " + run}, 'Test') RETURNING id`)).id;
    ids.teacherA = (
      await one<{ id: number }>(
        sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ta-${run}`}, 'Prof A', ${`ta-${run}@test.it`}) RETURNING id`,
      )
    ).id;
    ids.teacherB = (
      await one<{ id: number }>(
        sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`tb-${run}`}, 'Prof B', ${`tb-${run}@test.it`}) RETURNING id`,
      )
    ).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES (${ids.institutionA}, ${ids.teacherA}, 'amministratore')`);
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES (${ids.institutionB}, ${ids.teacherB}, 'amministratore')`);

    ids.classA = (
      await one<{ id: number }>(
        sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
            VALUES (${ids.institutionA}, ${ids.teacherA}, '1A', '1ª Superiore', 'Prof A', ${`JA${run.slice(-6)}`}) RETURNING id`,
      )
    ).id;
    ids.classB = (
      await one<{ id: number }>(
        sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
            VALUES (${ids.institutionB}, ${ids.teacherB}, '1B', '1ª Superiore', 'Prof B', ${`JB${run.slice(-6)}`}) RETURNING id`,
      )
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.classA}, ${ids.teacherA}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.classB}, ${ids.teacherB}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.classA}, ${`sa-${run}`}, ${studentAName})`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.classB}, ${`sb-${run}`}, ${studentBName})`);

    ids.materialA = (
      await one<{ id: number }>(
        sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
            VALUES (${ids.teacherA}, ${"Equazioni " + run}, 'Matematica', '1^ Superiore', 'Contenuto di prova sulle equazioni di primo grado.') RETURNING id`,
      )
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.materialA}, ${ids.classA})`);

    ids.baseObjective = (
      await one<{ id: number }>(
        sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.05'`,
      )
    ).id;
  });

  afterAll(async () => {
    if (!h) return;
    // Le FK a cascata puliscono classi, studenti, membri, override e obiettivi propri.
    await db.execute(sql`DELETE FROM institutions WHERE id IN (${ids.institutionA}, ${ids.institutionB})`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.materialA}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacherA}, ${ids.teacherB})`);
    await h.stop();
  });

  it("RLS e' abilitata sulle quattro tabelle nuove", async () => {
    const res = await db.execute(sql`
      SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('learning_objectives','learning_objective_prerequisites','institution_objective_overrides','material_objectives')`);
    const rows = res.rows as Array<{ relname: string; relrowsecurity: boolean }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("il catalogo base e' visibile al docente del proprio istituto, non a quello di un altro", async () => {
    const ok = await h.api(`/institutions/${ids.institutionA}/objectives?subject=Matematica`, { token: tokens.teacherA });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { objectives: Array<{ code: string; source: string }> };
    expect(body.objectives.length).toBeGreaterThanOrEqual(40);
    expect(body.objectives.every((o) => o.source === "sillabo")).toBe(true);

    const denied = await h.api(`/institutions/${ids.institutionA}/objectives`, { token: tokens.teacherB });
    expect(denied.status).toBe(404);

    const anonymous = await h.api(`/institutions/${ids.institutionA}/objectives`);
    expect(anonymous.status).toBe(401);

    const student = await h.api(`/institutions/${ids.institutionA}/objectives`, { token: tokens.studentA });
    expect(student.status).toBe(403);
  });

  it("l'adattamento di un obiettivo base resta dentro l'istituto che lo ha fatto", async () => {
    const before = (await db.execute(sql`SELECT title, review_status FROM learning_objectives WHERE id = ${ids.baseObjective}`))
      .rows[0] as { title: string; review_status: string };

    const patched = await h.api(`/institutions/${ids.institutionA}/objectives/${ids.baseObjective}`, {
      method: "PATCH",
      token: tokens.teacherA,
      json: { title: "Equazioni di primo grado (nostra formulazione)", reviewed: true },
    });
    expect(patched.status).toBe(200);
    const a = (await patched.json()) as { title: string; reviewStatus: string; customized: boolean };
    expect(a).toMatchObject({ title: "Equazioni di primo grado (nostra formulazione)", reviewStatus: "rivisto", customized: true });

    const forB = await h.api(`/institutions/${ids.institutionB}/objectives?subject=Matematica&gradeLevel=${encodeURIComponent("1ª Superiore")}`, { token: tokens.teacherB });
    const bBody = (await forB.json()) as { objectives: Array<{ code: string; title: string; reviewStatus: string }> };
    const bView = bBody.objectives.find((o) => o.code === "MAT1.ALG.05");
    expect(bView?.title).toBe(before.title);
    expect(bView?.reviewStatus).toBe(before.review_status);

    // Il catalogo condiviso non e' stato toccato.
    const raw = await db.execute(sql`SELECT title, review_status FROM learning_objectives WHERE id = ${ids.baseObjective}`);
    expect(raw.rows[0]).toEqual(before);
  });

  it("disattivare un obiettivo base lo toglie dalla mappa attiva del solo istituto", async () => {
    await h.api(`/institutions/${ids.institutionA}/objectives/${ids.baseObjective}`, {
      method: "PATCH",
      token: tokens.teacherA,
      json: { active: false },
    });
    const active = await h.api(`/institutions/${ids.institutionA}/objectives?subject=Matematica`, { token: tokens.teacherA });
    const body = (await active.json()) as { objectives: Array<{ code: string }> };
    expect(body.objectives.some((o) => o.code === "MAT1.ALG.05")).toBe(false);

    const withInactive = await h.api(`/institutions/${ids.institutionA}/objectives?subject=Matematica&includeInactive=1`, { token: tokens.teacherA });
    const all = (await withInactive.json()) as { objectives: Array<{ code: string; active: boolean }> };
    expect(all.objectives.find((o) => o.code === "MAT1.ALG.05")?.active).toBe(false);

    const forB = await h.api(`/institutions/${ids.institutionB}/objectives?subject=Matematica`, { token: tokens.teacherB });
    const bBody = (await forB.json()) as { objectives: Array<{ code: string }> };
    expect(bBody.objectives.some((o) => o.code === "MAT1.ALG.05")).toBe(true);

    // Un obiettivo base non si cancella: si disattiva.
    const del = await h.api(`/institutions/${ids.institutionA}/objectives/${ids.baseObjective}`, { method: "DELETE", token: tokens.teacherA });
    expect(del.status).toBe(404);
  });

  it("un obiettivo scritto dall'istituto nasce rivisto, con propedeuticita', ed e' invisibile agli altri", async () => {
    const created = await h.api(`/institutions/${ids.institutionA}/objectives`, {
      method: "POST",
      token: tokens.teacherA,
      json: {
        subject: "Matematica",
        gradeLevel: "1ª Superiore",
        title: "Percentuali nei problemi di realta'",
        description: "Applica le percentuali a sconti, interessi e statistiche.",
        requires: ["MAT1.ARI.05"],
      },
    });
    expect(created.status).toBe(201);
    const own = (await created.json()) as { id: number; code: string; source: string; reviewStatus: string; requires: string[] };
    expect(own).toMatchObject({ source: "istituto", reviewStatus: "rivisto", requires: ["MAT1.ARI.05"] });
    expect(own.code).toMatch(/^IST\.\d{2}$/);

    const forB = await h.api(`/institutions/${ids.institutionB}/objectives?subject=Matematica`, { token: tokens.teacherB });
    const bBody = (await forB.json()) as { objectives: Array<{ id: number }> };
    expect(bBody.objectives.some((o) => o.id === own.id)).toBe(false);

    // B non puo' nemmeno toccarlo passando per il proprio istituto.
    const foreignPatch = await h.api(`/institutions/${ids.institutionB}/objectives/${own.id}`, {
      method: "PATCH",
      token: tokens.teacherB,
      json: { title: "Dirottato" },
    });
    expect(foreignPatch.status).toBe(404);

    const badPrereq = await h.api(`/institutions/${ids.institutionA}/objectives`, {
      method: "POST",
      token: tokens.teacherA,
      json: { subject: "Matematica", gradeLevel: "1ª Superiore", title: "Con prerequisito inesistente", requires: ["NON.ESISTE"] },
    });
    expect(badPrereq.status).toBe(400);

    const del = await h.api(`/institutions/${ids.institutionA}/objectives/${own.id}`, { method: "DELETE", token: tokens.teacherA });
    expect(del.status).toBe(204);
  });

  it("gli obiettivi di un materiale: il docente li fissa, gli studenti della classe li leggono, gli altri no", async () => {
    const [ari05] = (
      await db.execute(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ARI.05'`)
    ).rows as Array<{ id: number }>;

    const put = await h.api(`/materials/${ids.materialA}/objectives`, {
      method: "PUT",
      token: tokens.teacherA,
      json: { objectiveIds: [ari05.id] },
    });
    expect(put.status).toBe(200);

    const byStudentA = await h.api(`/materials/${ids.materialA}/objectives`, { token: tokens.studentA });
    expect(byStudentA.status).toBe(200);
    const seen = (await byStudentA.json()) as { objectives: Array<{ code: string; source: string }> };
    expect(seen.objectives).toEqual([expect.objectContaining({ code: "MAT1.ARI.05", source: "docente" })]);

    const byStudentB = await h.api(`/materials/${ids.materialA}/objectives`, { token: tokens.studentB });
    expect(byStudentB.status).toBe(404);

    const byTeacherB = await h.api(`/materials/${ids.materialA}/objectives`, {
      method: "PUT",
      token: tokens.teacherB,
      json: { objectiveIds: [] },
    });
    expect(byTeacherB.status).toBe(404);

    // Senza chiave Anthropic il suggerimento fallisce in modo controllato, non con un 500 anonimo.
    const suggest = await h.api(`/materials/${ids.materialA}/objectives/suggest`, { method: "POST", token: tokens.teacherA });
    expect(suggest.status).toBe(502);
  });

  it("i tentativi di quiz di un materiale non sono piu' leggibili da chiunque", async () => {
    await db.execute(sql`
      INSERT INTO quiz_attempts (material_id, auth_user_id, class_id, student_name, score, total, graded_answers)
      VALUES (${ids.materialA}, ${`sa-${run}`}, ${ids.classA}, ${studentAName}, 1, 1, '[]'::jsonb)`);

    const teacherA = await h.api(`/materials/${ids.materialA}/quiz-attempts`, { token: tokens.teacherA });
    expect(teacherA.status).toBe(200);
    expect(((await teacherA.json()) as unknown[]).length).toBe(1);

    const studentA = await h.api(`/materials/${ids.materialA}/quiz-attempts`, { token: tokens.studentA });
    expect(studentA.status).toBe(200);

    const teacherB = await h.api(`/materials/${ids.materialA}/quiz-attempts`, { token: tokens.teacherB });
    expect(teacherB.status).toBe(404);

    const studentB = await h.api(`/materials/${ids.materialA}/quiz-attempts`, { token: tokens.studentB });
    expect(studentB.status).toBe(404);
  });

  it("i ripassi di uno studente si leggono e si chiudono solo da lui (o dal suo docente)", async () => {
    const [item] = (
      await db.execute(sql`
        INSERT INTO review_items (material_id, student_name, topic, due_date, status)
        VALUES (${ids.materialA}, ${studentAName}, 'Equazioni', CURRENT_DATE, 'da_fare') RETURNING id`)
    ).rows as Array<{ id: number }>;

    const path = `/materials/${ids.materialA}/review-items/${encodeURIComponent(studentAName)}`;
    expect((await h.api(path, { token: tokens.studentA })).status).toBe(200);
    expect((await h.api(path, { token: tokens.teacherA })).status).toBe(200);
    expect((await h.api(path, { token: tokens.studentB })).status).toBe(404);
    expect((await h.api(path, { token: tokens.teacherB })).status).toBe(404);

    const foreign = await h.api(`/review-items/${item.id}`, { method: "PATCH", token: tokens.studentB, json: { status: "completato" } });
    expect(foreign.status).toBe(404);
    const own = await h.api(`/review-items/${item.id}`, { method: "PATCH", token: tokens.studentA, json: { status: "completato" } });
    expect(own.status).toBe(200);
  });
});
