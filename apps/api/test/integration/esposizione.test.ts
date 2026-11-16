import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** Esposizione a voce: lo studente consegna una registrazione, l'assistente non la valuta, il docente ascolta e firma. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Esposizione a voce", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, cls: 0, material: 0, spoken: 0, written: 0, submission: 0 };
  const tokens = { teacher: "", student: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  const audio = "/objects/uploads/3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b/esposizione.webm";

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `et-${run}`, email: `et-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.student = h.tokenFor({ id: `es-${run}`, email: `es-${run}@t.it`, role: "studente", name: "Anna" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Esp " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`et-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '2E', '2ª Superiore', 'Prof', ${`E${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`es-${run}`}, ${"Anna " + run})`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"My town " + run}, 'Inglese', '2ª Superiore', 'Describing places.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id = ${ids.teacher}`);
    await h.stop();
  });

  it("il docente assegna un'esposizione a voce e un tema", async () => {
    h.anthropicReplies(() => "Talk for two minutes about your town: where it is, what you like, what you would change.");
    const spoken = await h.api(`/materials/${ids.material}/written-exams`, { method: "POST", token: tokens.teacher, json: { examType: "esposizione" } });
    expect(spoken.status).toBe(201);
    ids.spoken = ((await spoken.json()) as { id: number }).id;
    const written = await h.api(`/materials/${ids.material}/written-exams`, { method: "POST", token: tokens.teacher, json: { examType: "tema" } });
    ids.written = ((await written.json()) as { id: number }).id;
  });

  it("un'esposizione non si consegna per iscritto, e un tema non si consegna a voce", async () => {
    const noAudio = await h.api(`/written-exams/${ids.spoken}/submit`, { method: "POST", token: tokens.student, json: { studentAnswer: "solo testo" } });
    expect(noAudio.status).toBe(400);
    const audioOnWritten = await h.api(`/written-exams/${ids.written}/submit`, { method: "POST", token: tokens.student, json: { studentAnswer: "testo", audioObjectPath: audio } });
    expect(audioOnWritten.status).toBe(400);
    const badPath = await h.api(`/written-exams/${ids.spoken}/submit`, { method: "POST", token: tokens.student, json: { audioObjectPath: "/objects/../segreti.webm" } });
    expect(badPath.status).toBe(400);
  });

  it("la registrazione viene consegnata senza chiamare l'assistente", async () => {
    const before = h.anthropicRequests.length;
    const res = await h.api(`/written-exams/${ids.spoken}/submit`, { method: "POST", token: tokens.student, json: { audioObjectPath: audio, audioSeconds: 95 } });
    expect(res.status).toBe(201);
    ids.submission = ((await res.json()) as { id: number }).id;
    expect(h.anthropicRequests.length).toBe(before);
    const again = await h.api(`/written-exams/${ids.spoken}/submit`, { method: "POST", token: tokens.student, json: { audioObjectPath: audio } });
    expect(again.status).toBe(409);
  });

  it("il docente la trova da ascoltare, senza proposta; firma e lo studente vede voto e registrazione", async () => {
    const pending = (await (await h.api(`/validations/pending`, { token: tokens.teacher })).json()) as {
      writtenSubmissions: Array<{ id: number; audioObjectPath: string | null; audioSeconds: number | null; grade: number | null; feedback: string }>;
    };
    const mine = pending.writtenSubmissions.find((w) => w.id === ids.submission)!;
    expect(mine).toMatchObject({ audioObjectPath: audio, audioSeconds: 95, grade: null, feedback: "" });

    const signed = await h.api(`/written-submissions/${ids.submission}/validate`, { method: "POST", token: tokens.teacher, json: { grade: 8, feedback: "Good fluency.", diagnosis: [] } });
    expect(signed.status).toBe(200);
    const exams = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student })).json()) as Array<{
      id: number;
      mySubmission: { grade: number | null; audioObjectPath: string | null } | null;
    }>;
    expect(exams.find((e) => e.id === ids.spoken)?.mySubmission).toMatchObject({ grade: 8, audioObjectPath: audio });
  });
});
