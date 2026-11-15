import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Aiuti progressivi: l'assistente li propone, il docente li approva, e solo
 * allora lo studente puo' chiederli durante l'esercitazione.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Aiuti progressivi sulle domande", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0, q1: 0, q2: 0 };
  const tokens = { teacher: "", other: "", student: "" };

  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  type QuizSet = { questions: Array<{ id: number; hints: string[] }> };
  const quizHints = async () => {
    const res = await h.api(`/materials/${ids.material}/quiz-set`, { token: tokens.student });
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuizSet;
    return new Map(body.questions.map((q) => [q.id, q.hints]));
  };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `ht-${run}`, email: `ht-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `ho-${run}`, email: `ho-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.student = h.tokenFor({ id: `hs-${run}`, email: `hs-${run}@t.it`, role: "studente", name: "Anna" });

    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Hint " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ht-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ho-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '1H', '1ª Superiore', 'Prof', ${`H${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`hs-${run}`}, ${"Anna " + run})`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"Eq " + run}, 'Matematica', '1ª Superiore', 'Equazioni di primo grado.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    // Due domande gia' approvate, nate prima degli aiuti.
    ids.q1 = (await one<{ id: number }>(sql`INSERT INTO questions (material_id, question, answer, topic, difficulty) VALUES (${ids.material}, 'Risolvi 2x = 4', 'x = 2', 'Equazioni', 'facile') RETURNING id`)).id;
    ids.q2 = (await one<{ id: number }>(sql`INSERT INTO questions (material_id, question, answer, topic, difficulty) VALUES (${ids.material}, 'Risolvi 3x + 1 = 10', 'x = 3', 'Equazioni', 'medio') RETURNING id`)).id;
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("un docente estraneo non puo' far preparare ne' approvare gli aiuti", async () => {
    for (const path of ["hints", "hints/approve"]) {
      const res = await h.api(`/materials/${ids.material}/questions/${path}`, { method: "POST", token: tokens.other });
      expect(res.status).toBe(404);
    }
  });

  it("gli aiuti proposti restano in bozza: lo studente non li vede, e al modello non va alcun dato sugli studenti", async () => {
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() =>
      JSON.stringify({
        items: [
          { id: ids.q1, hints: ["Che operazione lega 2 e x?", "Dividi entrambi i membri per 2"] },
          { id: ids.q2, hints: ["Porta i numeri da una parte", "Sottrai 1, poi dividi", "3x = 9: quanto vale x?", "di troppo"] },
          { id: 999999, hints: ["domanda inesistente"] },
        ],
      }),
    );
    const res = await h.api(`/materials/${ids.material}/questions/hints`, { method: "POST", token: tokens.teacher });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prepared: 2 });

    const sent = JSON.stringify(h.anthropicRequests.slice(before));
    expect(sent).toContain("Risolvi 2x = 4");
    expect(sent).not.toContain("Anna");

    const list = (await (await h.api(`/materials/${ids.material}/questions`, { token: tokens.teacher })).json()) as Array<{ id: number; hints: string[]; hintsStatus: string }>;
    const q2 = list.find((q) => q.id === ids.q2)!;
    expect(q2.hints).toHaveLength(3);
    expect(q2.hintsStatus).toBe("bozza");

    const seen = await quizHints();
    expect(seen.get(ids.q1)).toEqual([]);
    expect(seen.get(ids.q2)).toEqual([]);
    const asStudent = (await (await h.api(`/materials/${ids.material}/questions`, { token: tokens.student })).json()) as Array<{ id: number; hints: string[]; hintsStatus?: string }>;
    expect(asStudent.every((q) => q.hints.length === 0 && q.hintsStatus === undefined)).toBe(true);
  });

  it("gli aiuti che il docente riscrive sono subito suoi; gli altri arrivano dopo l'approvazione", async () => {
    const edited = await h.api(`/questions/${ids.q1}`, { method: "PATCH", token: tokens.teacher, json: { hints: ["  Isola la x  ", ""] } });
    expect(edited.status).toBe(200);
    let seen = await quizHints();
    expect(seen.get(ids.q1)).toEqual(["Isola la x"]);
    expect(seen.get(ids.q2)).toEqual([]);

    const approved = await h.api(`/materials/${ids.material}/questions/hints/approve`, { method: "POST", token: tokens.teacher });
    expect(await approved.json()).toEqual({ approved: 1 });
    seen = await quizHints();
    expect(seen.get(ids.q2)).toHaveLength(3);
  });

  it("senza domande scoperte l'assistente non viene nemmeno chiamato", async () => {
    const before = h.anthropicRequests.length;
    const res = await h.api(`/materials/${ids.material}/questions/hints`, { method: "POST", token: tokens.teacher });
    expect(await res.json()).toEqual({ prepared: 0 });
    expect(h.anthropicRequests.length).toBe(before);
  });

  it("le domande generate nascono con gli aiuti, visibili solo dopo l'approvazione della domanda", async () => {
    h.anthropicReplies(() =>
      JSON.stringify([{ question: "Risolvi 4x = 12", answer: "x = 3", topic: "Equazioni", difficulty: "facile", hints: ["Dividi per il coefficiente"] }]),
    );
    const res = await h.api(`/materials/${ids.material}/generate-questions`, { method: "POST", token: tokens.teacher });
    expect(res.status).toBe(201);
    const [created] = (await res.json()) as Array<{ id: number; hints: string[]; hintsStatus: string }>;
    expect(created.hints).toEqual(["Dividi per il coefficiente"]);
    expect(created.hintsStatus).toBe("bozza");
    expect((await quizHints()).has(created.id)).toBe(false);

    await h.api(`/questions/${created.id}/approve`, { method: "POST", token: tokens.teacher });
    expect((await quizHints()).get(created.id)).toEqual(["Dividi per il coefficiente"]);
  });
});
