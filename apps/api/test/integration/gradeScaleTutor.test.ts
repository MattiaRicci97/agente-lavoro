import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Universita': voti in trentesimi, assistente che scrive per adulti, tutor che
 * prepara la correzione e docente titolare che la conferma.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Scala dei voti e tutor", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, prof: 0, tutor: 0, cls: 0, material: 0, exam: 0, submission: 0 };
  const tokens = { prof: "", tutor: "", student: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  type Pending = {
    writtenSubmissions: Array<{
      id: number;
      grade: number | null;
      gradeScale: string;
      signer: string;
      validationStatus: string;
      prepared: { tutorName: string; grade: number | null; feedback: string } | null;
    }>;
  };
  const pendingFor = async (token: string) => (await (await h.api(`/validations/pending`, { token })).json()) as Pending;
  const studentView = async () => {
    const exams = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student })).json()) as Array<{
      id: number;
      mySubmission: { status: string; grade: number | null; gradeScale: string; feedback: string | null } | null;
    }>;
    return exams.find((e) => e.id === ids.exam)!.mySubmission!;
  };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.prof = h.tokenFor({ id: `gp-${run}`, email: `gp-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.tutor = h.tokenFor({ id: `gt-${run}`, email: `gt-${run}@t.it`, role: "docente", name: "Tutor" });
    tokens.student = h.tokenFor({ id: `gs-${run}`, email: `gs-${run}@t.it`, role: "studente", name: "Luca" });
    ids.institution = (
      await one<{ id: number }>(sql`INSERT INTO institutions (name, city, kind) VALUES (${"Ateneo " + run}, 'Test', 'universita') RETURNING id`)
    ).id;
    ids.prof = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`gp-${run}`}, 'Prof Rossi', 'p@t.it') RETURNING id`)).id;
    ids.tutor = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`gt-${run}`}, 'Giulia Tutor', 't@t.it') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES (${ids.institution}, ${ids.prof}, 'amministratore')`);
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.prof}, 'Analisi I', 'Laurea triennale', 'Prof Rossi', ${`G${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.prof}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.tutor}, 'tutor')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`gs-${run}`}, ${"Luca " + run})`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.prof}, ${"Limiti " + run}, 'Analisi', 'Laurea triennale', 'Definizione di limite.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.prof}, ${ids.tutor})`);
    await h.stop();
  });

  it("l'assistente scrive per un corso universitario", async () => {
    h.anthropicReplies(() => "Dimostra, usando la definizione, che il limite di 1/x per x che tende a infinito vale zero.");
    const before = h.anthropicRequests.length;
    const res = await h.api(`/materials/${ids.material}/written-exams`, { method: "POST", token: tokens.prof, json: { examType: "tema" } });
    expect(res.status).toBe(201);
    ids.exam = ((await res.json()) as { id: number }).id;
    const system = h.anthropicRequests[before].system ?? "";
    expect(system).toContain("corso universitario");
    expect(system).not.toContain("di scuola superiore");
  });

  it("la consegna prende la scala dell'ateneo: trentesimi", async () => {
    h.anthropicReplies(() => JSON.stringify({ grade: 8, feedback: "Dimostrazione corretta, manca un passaggio.", diagnosis: [] }));
    const res = await h.api(`/written-exams/${ids.exam}/submit`, { method: "POST", token: tokens.student, json: { studentAnswer: "Fissato epsilon, scelgo M = 1/epsilon..." } });
    expect(res.status).toBe(201);
    ids.submission = ((await res.json()) as { id: number }).id;
    const row = await one<{ grade_scale: string }>(sql`SELECT grade_scale FROM written_exam_submissions WHERE id = ${ids.submission}`);
    expect(row.grade_scale).toBe("trentesimi");
  });

  it("il tutor prepara la correzione; allo studente non arriva nulla", async () => {
    const forTutor = (await pendingFor(tokens.tutor)).writtenSubmissions.find((w) => w.id === ids.submission)!;
    expect(forTutor).toMatchObject({ signer: "tutor", gradeScale: "trentesimi", grade: 8, prepared: null });

    const outOfScale = await h.api(`/written-submissions/${ids.submission}/validate`, { method: "POST", token: tokens.tutor, json: { grade: 32, feedback: "x" } });
    expect(outOfScale.status).toBe(400);

    const prepared = await h.api(`/written-submissions/${ids.submission}/validate`, {
      method: "POST",
      token: tokens.tutor,
      json: { grade: 27, feedback: "Buona dimostrazione." },
    });
    expect(prepared.status).toBe(200);
    expect(await studentView()).toMatchObject({ status: "da_validare", grade: null, feedback: null });
    // Una volta preparata, non e' piu' nella coda del tutor.
    expect((await pendingFor(tokens.tutor)).writtenSubmissions.some((w) => w.id === ids.submission)).toBe(false);
  });

  it("il docente titolare la trova da confermare e firma con la lode", async () => {
    const forProf = (await pendingFor(tokens.prof)).writtenSubmissions.find((w) => w.id === ids.submission)!;
    expect(forProf).toMatchObject({
      signer: "docente",
      validationStatus: "da_confermare",
      prepared: { tutorName: "Giulia Tutor", grade: 27, feedback: "Buona dimostrazione." },
    });

    const signed = await h.api(`/written-submissions/${ids.submission}/validate`, {
      method: "POST",
      token: tokens.prof,
      json: { grade: 31, feedback: "Ottima dimostrazione." },
    });
    expect(signed.status).toBe(200);
    expect(await studentView()).toMatchObject({ status: "validata", grade: 31, gradeScale: "trentesimi", feedback: "Ottima dimostrazione." });
    const row = await one<{ prepared: number; validated: number }>(
      sql`SELECT prepared_by_teacher_id AS prepared, validated_by_teacher_id AS validated FROM written_exam_submissions WHERE id = ${ids.submission}`,
    );
    expect(row).toEqual({ prepared: ids.tutor, validated: ids.prof });
  });

  it("dopo la firma il tutor non puo' piu' cambiarla", async () => {
    const res = await h.api(`/written-submissions/${ids.submission}/validate`, { method: "POST", token: tokens.tutor, json: { grade: 20, feedback: "" } });
    expect(res.status).toBe(409);
  });

  it("l'amministratore puo' scegliere un'altra scala per l'istituto", async () => {
    const before = (await (await h.api(`/me/profile`, { token: tokens.prof })).json()) as { gradeScale: string };
    expect(before.gradeScale).toBe("trentesimi");
    const notAdmin = await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.tutor, json: { gradeScale: "centesimi" } });
    expect(notAdmin.status).toBe(404);
    const res = await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.prof, json: { gradeScale: "centesimi" } });
    expect(res.status).toBe(200);
    const after = (await (await h.api(`/me/profile`, { token: tokens.prof })).json()) as {
      gradeScale: string;
      kind: string;
      adminInstitutions: Array<{ id: number; gradeScale: string; gradeScaleChosen: boolean }>;
    };
    expect(after).toMatchObject({ gradeScale: "centesimi", kind: "universita" });
    expect(after.adminInstitutions.find((i) => i.id === ids.institution)).toMatchObject({ gradeScale: "centesimi", gradeScaleChosen: true });
  });
});
