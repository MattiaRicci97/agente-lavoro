import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Chat di ripasso sul corso", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, clsA: 0, clsB: 0, doc: 0, lesson: 0, history: 0, secret: 0 };
  const tokens: Record<string, string> = {};
  const annaName = `Annalisa ${run}`;
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `ct-${run}`, email: "a@t.it", role: "docente", name: "Prof" });
    tokens.anna = h.tokenFor({ id: `ca-${run}`, email: "b@t.it", role: "studente", name: annaName });
    tokens.bruno = h.tokenFor({ id: `cb-${run}`, email: "c@t.it", role: "studente", name: "Bruno" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Cor " + run}, 'T') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ct-${run}`}, 'Prof', 'a@t.it') RETURNING id`)).id;
    for (const key of ["clsA", "clsB"] as const) {
      ids[key] = (await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, ${key}, '1ª Superiore', 'Prof', ${`${key === "clsA" ? "X" : "Y"}${run.slice(-7)}`}) RETURNING id`)).id;
      await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids[key]}, ${ids.teacher}, 'coordinatore')`);
    }
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.clsA}, ${`ca-${run}`}, ${annaName})`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.clsB}, ${`cb-${run}`}, 'Bruno')`);

    const material = async (title: string, subject: string, content: string, classId: number, kind = "documento", lessonDate: string | null = null) => {
      const { id } = await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content, kind, lesson_date)
        VALUES (${ids.teacher}, ${title}, ${subject}, '1ª Superiore', ${content}, ${kind}, ${lessonDate}) RETURNING id`);
      await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${id}, ${classId})`);
      return id;
    };
    ids.doc = await material("Dispensa sulle equazioni", "Matematica", "Un'equazione di primo grado si risolve isolando l'incognita con i principi di equivalenza.\n\nIl primo principio permette di sommare lo stesso numero ai due membri.", ids.clsA);
    ids.lesson = await material("Disequazioni", "Matematica", "Oggi vediamo le disequazioni di primo grado. Attenzione: quando si moltiplica o si divide per un numero negativo il verso della disequazione si inverte. Facciamo un esempio alla lavagna con meno due x maggiore di sei.", ids.clsA, "lezione", "2026-10-12");
    ids.history = await material("Giolitti", "Storia", "L'eta' giolittiana e le disequazioni sociali del primo Novecento.", ids.clsA);
    ids.secret = await material("Altra classe", "Matematica", "Contenuto segretissimo sulle disequazioni riservato alla classe B.", ids.clsB);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM materials WHERE id IN (${ids.doc}, ${ids.lesson}, ${ids.history}, ${ids.secret})`);
    await db.execute(sql`DELETE FROM teachers WHERE id = ${ids.teacher}`);
    await h.stop();
  });

  it("elenca i corsi dello studente con documenti e lezioni", async () => {
    const { courses } = (await (await h.api("/courses/mine", { token: tokens.anna })).json()) as { courses: Array<{ subject: string; documents: number; lessons: number }> };
    expect(courses).toEqual([
      expect.objectContaining({ subject: "Matematica", documents: 1, lessons: 1 }),
      expect.objectContaining({ subject: "Storia", documents: 1, lessons: 0 }),
    ]);
  });

  it("risponde dal materiale del corso, cercando ancora se serve, e cita le fonti", async () => {
    let call = 0;
    h.anthropicReplies(() => {
      call += 1;
      return call === 1
        ? [{ type: "tool_use", id: "tu_1", name: "cerca_nel_corso", input: { query: "equazioni principi equivalenza" } }]
        : "Quando dividi per un numero negativo il verso si inverte [1]. Le equazioni invece si risolvono con i principi di equivalenza [2].";
    });
    const res = await h.api("/courses/chat", { method: "POST", token: tokens.anna, json: { classId: ids.clsA, subject: "Matematica", question: "Mi spieghi la disequazione?" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answer: string; sources: Array<{ label: string; kind: string }>; passages: Array<{ n: number; label: string }> };
    expect(body.answer).toContain("il verso si inverte [1]");
    // "disequazione" trova "disequazioni": la lezione e' la prima fonte.
    expect(body.passages[0]).toMatchObject({ n: 1, label: "Lezione del 12 ottobre: Disequazioni" });
    expect(body.sources.map((s) => s.label)).toContain("Dispensa sulle equazioni");

    const first = JSON.stringify(h.anthropicRequests.at(-2));
    const second = JSON.stringify(h.anthropicRequests.at(-1));
    expect(first).toContain("il verso della disequazione si inverte");
    expect(second).toContain("tool_result");
    expect(second).toContain("principi di equivalenza");
    for (const sent of [first, second]) {
      // Solo il corso giusto: niente altre materie, niente altre classi, niente nome dello studente.
      expect(sent).not.toContain("giolittiana");
      expect(sent).not.toContain("segretissimo");
      expect(sent).not.toContain("Annalisa");
    }
  });

  it("uno studente di un'altra classe non entra nel corso", async () => {
    h.anthropicReplies(() => "non dovrebbe arrivare qui");
    const before = h.anthropicRequests.length;
    for (const path of ["/courses/chat", "/courses/review-plan", "/courses/oral-target"]) {
      const res = await h.api(path, { method: "POST", token: tokens.bruno, json: { classId: ids.clsA, subject: "Matematica", question: "disequazioni", topic: "disequazioni" } });
      expect(res.status).toBe(404);
    }
    expect((await h.api("/courses/chat", { method: "POST", json: { classId: ids.clsA, subject: "Matematica", question: "x" } })).status).toBe(401);
    expect(h.anthropicRequests.length).toBe(before);
  });

  it("prepara e salva un piano di ripasso costruito sulle fonti del corso", async () => {
    h.anthropicReplies(() => JSON.stringify({
      title: "Ripasso disequazioni",
      summary: "Tre passi brevi.",
      steps: [
        { title: "Riascolta la regola", activity: "Rileggi il passaggio sul verso che si inverte.", minutes: 15, sources: [1] },
        { title: "Prova da solo", activity: "Risolvi -2x > 6 senza guardare.", minutes: 10, sources: [1, 99] },
      ],
    }));
    const res = await h.api("/courses/review-plan", { method: "POST", token: tokens.anna, json: { classId: ids.clsA, subject: "Matematica", topic: "disequazioni" } });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: { steps: Array<{ sources: Array<{ title: string }> }> } };
    expect(body.plan.steps).toHaveLength(2);
    // Una fonte inesistente indicata dal modello viene ignorata.
    expect(body.plan.steps[1].sources).toEqual([expect.objectContaining({ title: "Lezione del 12 ottobre: Disequazioni" })]);
    expect(JSON.stringify(h.anthropicRequests.at(-1))).not.toContain("Annalisa");

    const mine = (await (await h.api("/courses/review-plans", { token: tokens.anna })).json()) as { plans: Array<{ topic: string }> };
    expect(mine.plans[0].topic).toBe("disequazioni");
    expect(((await (await h.api("/courses/review-plans", { token: tokens.bruno })).json()) as { plans: unknown[] }).plans).toHaveLength(0);

    const missing = await h.api("/courses/review-plan", { method: "POST", token: tokens.anna, json: { classId: ids.clsA, subject: "Matematica", topic: "trigonometria sferica" } });
    expect(missing.status).toBe(404);
  });

  it("porta all'interrogazione simulata sull'argomento, con i passaggi di tutto il corso", async () => {
    const target = await h.api("/courses/oral-target", { method: "POST", token: tokens.anna, json: { classId: ids.clsA, subject: "Matematica", topic: "disequazioni verso" } });
    expect(target.status).toBe(200);
    expect(((await target.json()) as { materialId: number }).materialId).toBe(ids.lesson);

    h.anthropicReplies(() => JSON.stringify({ reply: "Cosa succede al verso se dividi per -2?", finished: false, grade: null, feedback: null }));
    // Parte dalla dispensa, ma l'argomento chiesto e' nella lezione: i passaggi vengono da li'.
    const start = await h.api(`/materials/${ids.doc}/oral-sessions`, { method: "POST", token: tokens.anna, json: { studentName: annaName, topic: "disequazioni verso" } });
    expect(start.status).toBe(201);
    const session = (await start.json()) as { id: number };
    const sent = JSON.stringify(h.anthropicRequests.at(-1));
    expect(sent).toContain("il verso della disequazione si inverte");
    expect(sent).toContain("Lezione del 12 ottobre");
    expect(sent).not.toContain("segretissimo");
    const row = await one<{ focus_topic: string }>(sql`SELECT focus_topic FROM oral_sessions WHERE id = ${session.id}`);
    expect(row.focus_topic).toBe("disequazioni verso");

    // Anche i turni successivi restano sull'argomento.
    await h.api(`/oral-sessions/${session.id}/messages`, { method: "POST", token: tokens.anna, json: { content: "Si inverte." } });
    expect(JSON.stringify(h.anthropicRequests.at(-1))).toContain("il verso della disequazione si inverte");
  });

  it("il docente carica una lezione: entra nell'archivio ed e' subito cercabile", async () => {
    h.anthropicReplies(() => JSON.stringify({ topic: "Algebra", subtopic: "Sistemi", objectiveCodes: [] }));
    const res = await h.api("/materials", {
      method: "POST",
      token: tokens.teacher,
      json: { title: "Sistemi lineari", subject: "Matematica", gradeLevel: "1ª Superiore", content: "Lezione sui sistemi lineari: il metodo di sostituzione ricava una incognita e la sostituisce nell'altra equazione.", classIds: [ids.clsA], kind: "lezione", lessonDate: "2026-11-03" },
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    const row = await one<{ kind: string; lesson_date: string; chunks: string }>(sql`
      SELECT kind, lesson_date, (SELECT count(*)::text FROM course_chunks WHERE material_id = ${id}) AS chunks FROM materials WHERE id = ${id}`);
    expect(row).toMatchObject({ kind: "lezione", lesson_date: "2026-11-03", chunks: "1" });

    h.anthropicReplies(() => "Il metodo di sostituzione ricava un'incognita [1].");
    const chat = (await (await h.api("/courses/chat", { method: "POST", token: tokens.anna, json: { classId: ids.clsA, subject: "Matematica", question: "metodo di sostituzione" } })).json()) as { passages: Array<{ label: string }> };
    expect(chat.passages[0].label).toBe("Lezione del 3 novembre: Sistemi lineari");
    await db.execute(sql`DELETE FROM materials WHERE id = ${id}`);
  });
});
