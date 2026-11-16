import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** L'agenda dello studente: solo cose sue, ancora aperte, in ordine di scadenza. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Agenda dello studente", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, cls: 0, otherCls: 0, material: 0, otherMaterial: 0, exam: 0, doneExam: 0, activity: 0 };
  const tokens = { anna: "", nobody: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  type Entry = { kind: string; title: string; when: string; link: string | null };
  const agenda = async (token: string) => {
    const res = await h.api(`/me/agenda`, { token });
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: Entry[] }).items;
  };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.anna = h.tokenFor({ id: `ga-${run}`, email: `ga-${run}@t.it`, role: "studente", name: "Anna" });
    tokens.nobody = h.tokenFor({ id: `gn-${run}`, email: `gn-${run}@t.it`, role: "studente", name: "Nessuno" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Age " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`gt2-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    const cls = async (name: string, code: string) =>
      (
        await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
          VALUES (${ids.institution}, ${ids.teacher}, ${name}, '1ª Superiore', 'Prof', ${code}) RETURNING id`)
      ).id;
    ids.cls = await cls("1X", `X${run.slice(-7)}`);
    ids.otherCls = await cls("1Y", `Y${run.slice(-7)}`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`ga-${run}`}, ${"Anna " + run})`);
    const material = async (title: string, classId: number) => {
      const id = (
        await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
          VALUES (${ids.teacher}, ${title}, 'Matematica', '1ª Superiore', 'Contenuto.') RETURNING id`)
      ).id;
      await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${id}, ${classId})`);
      return id;
    };
    ids.material = await material(`Mio ${run}`, ids.cls);
    ids.otherMaterial = await material(`Altrui ${run}`, ids.otherCls);
    const exam = async (materialId: number, due: string | null) =>
      (
        await one<{ id: number }>(sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id, status, due_date)
          VALUES (${materialId}, 'problema', 'Traccia', ${ids.teacher}, 'assegnato', ${due}) RETURNING id`)
      ).id;
    ids.exam = await exam(ids.material, day(-2));
    ids.doneExam = await exam(ids.material, day(3));
    await exam(ids.otherMaterial, day(1));
    await db.execute(sql`INSERT INTO written_exam_submissions (exam_id, auth_user_id, student_name, class_id, answer)
      VALUES (${ids.doneExam}, ${`ga-${run}`}, 'Anna', ${ids.cls}, 'fatto')`);
    ids.activity = (
      await one<{ id: number }>(sql`INSERT INTO guided_activities (class_id, teacher_id, subject, title, brief)
        VALUES (${ids.cls}, ${ids.teacher}, 'Matematica', ${"Guidata " + run}, 'Consegna di prova') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO guided_activities (class_id, teacher_id, subject, title, brief)
      VALUES (${ids.otherCls}, ${ids.teacher}, 'Matematica', 'Di un''altra classe', 'Consegna di prova')`);
    await db.execute(sql`INSERT INTO exam_dates (class_id, title, subject, exam_date) VALUES
      (${ids.cls}, 'Verifica futura', 'Matematica', ${day(5)}), (${ids.cls}, 'Verifica passata', 'Matematica', ${day(-5)})`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id IN (${ids.material}, ${ids.otherMaterial})`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id = ${ids.teacher}`);
    await h.stop();
  });

  it("senza accesso non risponde; chi non e' in nessuna classe ha un'agenda vuota", async () => {
    expect((await h.api(`/me/agenda`)).status).toBe(401);
    expect(await agenda(tokens.nobody)).toEqual([]);
  });

  it("mostra solo le cose aperte dello studente, in ordine di scadenza", async () => {
    const items = await agenda(tokens.anna);
    expect(items.map((e) => [e.kind, e.when])).toEqual([
      ["compito", "scaduto"],
      ["verifica", "settimana"],
      ["attivita", "senza_data"],
    ]);
    expect(items[0].link).toBe(`/studio/material/${ids.material}/scritto`);
    expect(items[2].link).toBe(`/studio/attivita/${ids.activity}`);
    const text = JSON.stringify(items);
    expect(text).not.toContain("Altrui");
    expect(text).not.toContain("altra classe");
    expect(text).not.toContain("Verifica passata");
  });

  it("un'attivita' completata esce dall'agenda", async () => {
    const student = await one<{ id: number }>(sql`SELECT id FROM students WHERE auth_user_id = ${`ga-${run}`}`);
    await db.execute(sql`INSERT INTO guided_activity_sessions (activity_id, student_id, turns, completed_at) VALUES (${ids.activity}, ${student.id}, 2, now())`);
    expect((await agenda(tokens.anna)).map((e) => e.kind)).toEqual(["compito", "verifica"]);
  });
});
