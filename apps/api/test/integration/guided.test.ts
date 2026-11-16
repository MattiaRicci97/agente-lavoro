import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Attivita' guidata: il docente la compone, gli studenti la svolgono in chat
 * dentro i materiali scelti, al docente torna solo un riepilogo di classe.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Attivita' guidate", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, inside: 0, outside: 0, foreign: 0, objective: 0, activity: 0 };
  const tokens = { teacher: "", other: "", outsider: "", students: [] as string[] };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  const count = async (table: string) => Number((await one<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))).n);

  type Summary = {
    classSize: number;
    started: number;
    completed: number;
    detailAvailable: boolean;
    objectives: Array<{ id: number; sicuro: number; incerto: number }>;
    stuckPoints: Array<{ text: string; count: number }>;
  };
  const summary = async () => {
    const res = await h.api(`/classes/${ids.cls}/guided-activities`, { token: tokens.teacher });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activities: Array<{ id: number; summary: Summary }> };
    return { raw: JSON.stringify(body), summary: body.activities.find((a) => a.id === ids.activity)!.summary };
  };
  const history = [
    { role: "user", content: "Non ricordo quando si inverte il verso" },
    { role: "assistant", content: "Cosa succede se dividi per -2?" },
    { role: "user", content: "Ah, si inverte" },
  ];

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `at-${run}`, email: `at-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `ao-${run}`, email: `ao-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.outsider = h.tokenFor({ id: `ax-${run}`, email: `ax-${run}@t.it`, role: "studente", name: "Fuori" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Att " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`at-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ao-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '1A', '1ª Superiore', 'Prof', ${`A${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    for (let i = 0; i < 4; i += 1) {
      tokens.students.push(h.tokenFor({ id: `as${i}-${run}`, email: `as${i}-${run}@t.it`, role: "studente", name: `Studente${i}` }));
      await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`as${i}-${run}`}, ${`Cognome${i} ${run}`})`);
    }
    const material = async (title: string, content: string, link: boolean) => {
      const id = (
        await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
          VALUES (${ids.teacher}, ${title}, 'Matematica', '1ª Superiore', ${content}) RETURNING id`)
      ).id;
      if (link) await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${id}, ${ids.cls})`);
      return id;
    };
    ids.inside = await material(`Disequazioni ${run}`, "Nelle disequazioni il verso si inverte quando si divide per un numero negativo.", true);
    ids.outside = await material(`Geometria ${run}`, "Nelle disequazioni geometriche ZEBRAFUORI il verso non c'entra.", true);
    ids.foreign = await material(`Altra classe ${run}`, "Disequazioni di un'altra classe.", false);
    ids.objective = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = 'MAT1.ALG.07'`)).id;
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id IN (${ids.inside}, ${ids.outside}, ${ids.foreign})`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("RLS e' abilitata sulle tabelle delle attivita' guidate", async () => {
    const rows = (await db.execute(sql`SELECT relrowsecurity FROM pg_class WHERE relname LIKE 'guided_activit%' AND relkind = 'r'`)).rows as Array<{
      relrowsecurity: boolean;
    }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("solo un docente della classe puo' creare, e solo con i materiali della classe", async () => {
    const body = {
      subject: "Matematica",
      title: "Il verso nelle disequazioni",
      brief: "Ripassa quando si inverte il verso.",
      materialIds: [ids.inside],
      objectiveIds: [ids.objective],
    };
    expect((await h.api(`/classes/${ids.cls}/guided-activities`, { method: "POST", token: tokens.other, json: body })).status).toBe(404);
    expect((await h.api(`/classes/${ids.cls}/guided-activities`, { method: "POST", token: tokens.students[0], json: body })).status).toBe(403);
    const foreign = await h.api(`/classes/${ids.cls}/guided-activities`, {
      method: "POST",
      token: tokens.teacher,
      json: { ...body, materialIds: [ids.foreign] },
    });
    expect(foreign.status).toBe(400);

    const res = await h.api(`/classes/${ids.cls}/guided-activities`, { method: "POST", token: tokens.teacher, json: body });
    expect(res.status).toBe(201);
    ids.activity = ((await res.json()) as { id: number }).id;
    const post = await one<{ n: string }>(sql`SELECT count(*) AS n FROM class_posts WHERE class_id = ${ids.cls} AND title LIKE 'Attività guidata:%'`);
    expect(Number(post.n)).toBe(1);
  });

  it("lo studente della classe la vede; chi e' fuori no", async () => {
    const mine = (await (await h.api(`/me/guided-activities`, { token: tokens.students[0] })).json()) as {
      activities: Array<{ id: number; status: string }>;
    };
    expect(mine.activities.find((a) => a.id === ids.activity)?.status).toBe("da_fare");
    const out = await h.api(`/guided-activities/${ids.activity}/chat`, { method: "POST", token: tokens.outsider, json: { question: "ciao" } });
    expect(out.status).toBe(404);
  });

  it("la chat cerca solo nei materiali scelti e non manda al modello il nome dello studente", async () => {
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() => "Partiamo: cosa succede al verso se dividi per -2?");
    const res = await h.api(`/guided-activities/${ids.activity}/chat`, {
      method: "POST",
      token: tokens.students[0],
      json: { question: "Quando si inverte il verso nelle disequazioni?" },
    });
    expect(res.status).toBe(200);
    const sent = JSON.stringify(h.anthropicRequests.slice(before));
    expect(sent).toContain("si inverte quando si divide");
    expect(sent).not.toContain("ZEBRAFUORI");
    expect(sent).not.toContain("Cognome0");
    expect(sent).toContain("attivita' guidata assegnata dal docente");
  });

  it("non si chiude un'attivita' mai iniziata", async () => {
    const res = await h.api(`/guided-activities/${ids.activity}/complete`, { method: "POST", token: tokens.students[1], json: { history } });
    expect(res.status).toBe(409);
  });

  it("sotto i tre svolgimenti il docente vede solo la partecipazione", async () => {
    h.anthropicReplies((r) =>
      String(r.system).includes("riassumi che cosa e' emerso")
        ? JSON.stringify({
            signals: [
              { objectiveCode: "MAT1.ALG.07", level: "incerto" },
              { objectiveCode: "INVENTATO", level: "sicuro" },
            ],
            stuckPoints: ["cambio di verso dividendo per un negativo"],
          })
        : "Bene, continua.",
    );
    const res = await h.api(`/guided-activities/${ids.activity}/complete`, { method: "POST", token: tokens.students[0], json: { history } });
    expect(res.status).toBe(200);
    const { summary: s } = await summary();
    expect(s).toMatchObject({ classSize: 4, started: 1, completed: 1, detailAvailable: false, objectives: [], stuckPoints: [] });
  });

  it("da tre in su compare il riepilogo per obiettivo, senza nomi e senza toccare voti o profilo", async () => {
    const mastery = await count("mastery_events");
    const submissions = await count("written_exam_submissions");
    for (const i of [1, 2]) {
      await h.api(`/guided-activities/${ids.activity}/chat`, {
        method: "POST",
        token: tokens.students[i],
        json: { question: "Da dove comincio con le disequazioni?" },
      });
      const res = await h.api(`/guided-activities/${ids.activity}/complete`, { method: "POST", token: tokens.students[i], json: { history } });
      expect(res.status).toBe(200);
    }
    const { summary: s, raw } = await summary();
    expect(s).toMatchObject({ started: 3, completed: 3, detailAvailable: true });
    expect(s.objectives).toEqual([expect.objectContaining({ id: ids.objective, sicuro: 0, incerto: 3 })]);
    expect(s.stuckPoints).toEqual([{ text: "cambio di verso dividendo per un negativo", count: 3 }]);
    expect(raw).not.toContain("Cognome");
    expect(await count("mastery_events")).toBe(mastery);
    expect(await count("written_exam_submissions")).toBe(submissions);
    // Della conversazione non resta nulla nel database.
    const stored = await one<{ dump: string }>(
      sql`SELECT coalesce(string_agg(row_to_json(s)::text, ''), '') AS dump FROM guided_activity_sessions s WHERE activity_id = ${ids.activity}`,
    );
    expect(stored.dump).not.toContain("Non ricordo quando");
  });

  it("un docente estraneo non legge il riepilogo ne' ritira l'attivita'", async () => {
    expect((await h.api(`/classes/${ids.cls}/guided-activities`, { token: tokens.other })).status).toBe(404);
    expect((await h.api(`/guided-activities/${ids.activity}`, { method: "DELETE", token: tokens.other })).status).toBe(404);
    expect((await h.api(`/guided-activities/${ids.activity}`, { method: "DELETE", token: tokens.teacher })).status).toBe(204);
  });
});
