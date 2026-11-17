import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Griglia di valutazione: proposta dall'assistente, approvata dal docente,
 * vista dallo studente con la traccia, usata nella correzione, firmata.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Griglia di valutazione dei compiti scritti", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, exam: 0, submission: 0 };
  const tokens = { teacher: "", other: "", student: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  type StudentExam = { id: number; rubric: Array<{ name: string; weight: number }> | null; mySubmission: { grade: number | null; rubricScores: Array<{ criterion: string; score: number }> } | null };
  const studentExam = async () => {
    const list = (await (await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student })).json()) as StudentExam[];
    return list.find((e) => e.id === ids.exam)!;
  };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `gt-${run}`, email: `gt-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `go-${run}`, email: `go-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.student = h.tokenFor({ id: `gs-${run}`, email: `gs-${run}@t.it`, role: "studente", name: "Anna" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Gri " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`gt-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`go-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '1G', '1ª Superiore', 'Prof', ${`G${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`gs-${run}`}, ${"Anna " + run})`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"Eq " + run}, 'Matematica', '1ª Superiore', 'Equazioni.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    ids.exam = (
      await one<{ id: number }>(sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id, status)
        VALUES (${ids.material}, 'problema', 'Risolvi tre equazioni e spiega i passaggi.', ${ids.teacher}, 'assegnato') RETURNING id`)
    ).id;
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM diagnosis_items WHERE class_id = ${ids.cls}`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("un docente estraneo non tocca la griglia", async () => {
    const draft = await h.api(`/written-exams/${ids.exam}/rubric-draft`, { method: "POST", token: tokens.other });
    expect(draft.status).toBe(404);
    const put = await h.api(`/written-exams/${ids.exam}/rubric`, { method: "PUT", token: tokens.other, json: { criteria: [{ name: "A", weight: 50 }, { name: "B", weight: 50 }], approved: true } });
    expect(put.status).toBe(404);
  });

  it("la proposta dell'assistente resta in bozza e lo studente non la vede", async () => {
    h.anthropicReplies(() =>
      JSON.stringify({ criteria: [{ name: "Correttezza", description: "Risultati giusti", weight: 60 }, { name: "Procedimento", description: "Passaggi spiegati", weight: 60 }] }),
    );
    const res = await h.api(`/written-exams/${ids.exam}/rubric-draft`, { method: "POST", token: tokens.teacher });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rubric: Array<{ weight: number }>; rubricStatus: string };
    expect(body.rubricStatus).toBe("bozza");
    expect(body.rubric.map((c) => c.weight)).toEqual([50, 50]);
    expect((await studentExam()).rubric).toBeNull();
  });

  it("una griglia malformata viene rifiutata", async () => {
    const res = await h.api(`/written-exams/${ids.exam}/rubric`, { method: "PUT", token: tokens.teacher, json: { criteria: [{ name: "Solo", weight: 100 }], approved: true } });
    expect(res.status).toBe(400);
  });

  it("approvata dal docente, arriva allo studente insieme alla traccia", async () => {
    const res = await h.api(`/written-exams/${ids.exam}/rubric`, {
      method: "PUT",
      token: tokens.teacher,
      json: { criteria: [{ name: "Correttezza", description: "Risultati giusti", weight: 70 }, { name: "Procedimento", description: "Passaggi spiegati", weight: 30 }], approved: true },
    });
    expect(res.status).toBe(200);
    expect((await studentExam()).rubric?.map((c) => c.name)).toEqual(["Correttezza", "Procedimento"]);
  });

  it("la correzione usa la griglia; i punteggi restano al docente fino alla firma", async () => {
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() =>
      JSON.stringify({
        grade: 6,
        feedback: "Bene i risultati, poco spiegato.",
        rubricScores: [
          { criterion: "Correttezza", score: 7, note: "Due risultati su tre" },
          { criterion: "Procedimento", score: 4, note: "Passaggi mancanti" },
          { criterion: "Inventato", score: 10 },
        ],
        diagnosis: [],
      }),
    );
    const res = await h.api(`/written-exams/${ids.exam}/submit`, { method: "POST", token: tokens.student, json: { studentAnswer: "x = 2; x = 3; x = 5" } });
    expect(res.status).toBe(201);
    ids.submission = ((await res.json()) as { id: number }).id;
    expect(JSON.stringify(h.anthropicRequests.slice(before))).toContain("Correttezza (peso 70%)");

    expect((await studentExam()).mySubmission).toMatchObject({ grade: null, rubricScores: [] });

    const pending = (await (await h.api(`/validations/pending`, { token: tokens.teacher })).json()) as {
      writtenSubmissions: Array<{ id: number; rubricScores: Array<{ criterion: string }>; rubricSuggestedGrade: number | null }>;
    };
    const mine = pending.writtenSubmissions.find((w) => w.id === ids.submission)!;
    expect(mine.rubricScores.map((s) => s.criterion)).toEqual(["Correttezza", "Procedimento"]);
    expect(mine.rubricSuggestedGrade).toBe(6.1);
  });

  it("con le consegne la griglia si blocca", async () => {
    const res = await h.api(`/written-exams/${ids.exam}/rubric`, { method: "DELETE", token: tokens.teacher });
    expect(res.status).toBe(409);
  });

  it("dopo la firma lo studente vede i punteggi del docente", async () => {
    const res = await h.api(`/written-submissions/${ids.submission}/validate`, {
      method: "POST",
      token: tokens.teacher,
      json: { grade: 7, feedback: "Spiega di più i passaggi.", diagnosis: [], rubricScores: [{ criterion: "Procedimento", score: 6 }] },
    });
    expect(res.status).toBe(200);
    const exam = await studentExam();
    expect(exam.mySubmission?.grade).toBe(7);
    expect(exam.mySubmission?.rubricScores).toEqual([
      { criterion: "Correttezza", score: 7, note: "Due risultati su tre" },
      { criterion: "Procedimento", score: 6, note: "Passaggi mancanti" },
    ]);
  });
});
