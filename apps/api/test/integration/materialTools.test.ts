import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** Strumenti per la lezione: bozza dell'assistente, testo del docente, condivisione solo per sua scelta. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Strumenti per la lezione", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, teacher: 0, other: 0, cls: 0, material: 0 };
  const tokens = { teacher: "", other: "", student: "", outsider: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  const shared = async (token: string) => h.api(`/materials/${ids.material}/shared-tools`, { token });
  type Tool = { kind: string; body: string; shared: boolean; untouched: boolean; language: string | null };

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.teacher = h.tokenFor({ id: `mt-${run}`, email: `mt-${run}@t.it`, role: "docente", name: "Prof" });
    tokens.other = h.tokenFor({ id: `mo-${run}`, email: `mo-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.student = h.tokenFor({ id: `ms-${run}`, email: `ms-${run}@t.it`, role: "studente", name: "Anna" });
    tokens.outsider = h.tokenFor({ id: `mx-${run}`, email: `mx-${run}@t.it`, role: "studente", name: "Fuori" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Tool " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`mt-${run}`}, 'Prof', 'p@t.it') RETURNING id`)).id;
    ids.other = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`mo-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.teacher}, '1T', '1ª Superiore', 'Prof', ${`T${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`ms-${run}`}, ${"Cognome " + run})`);
    ids.material = (
      await one<{ id: number }>(sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
        VALUES (${ids.teacher}, ${"Cellula " + run}, 'Scienze', '1ª Superiore', 'La cellula e'' l''unita'' fondamentale dei viventi. Il nucleo contiene il DNA.') RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.other})`);
    await h.stop();
  });

  it("RLS abilitata; un docente estraneo e uno studente non entrano", async () => {
    const row = await one<{ relrowsecurity: boolean }>(sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'material_tools'`);
    expect(row.relrowsecurity).toBe(true);
    expect((await h.api(`/materials/${ids.material}/tools`, { token: tokens.other })).status).toBe(404);
    expect((await h.api(`/materials/${ids.material}/tools/glossario/draft`, { method: "POST", token: tokens.other, json: {} })).status).toBe(404);
    expect((await h.api(`/materials/${ids.material}/tools`, { token: tokens.student })).status).toBe(403);
  });

  it("la bozza del glossario nasce dal solo materiale e non e' condivisa", async () => {
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() => "Cellula: unità fondamentale dei viventi.\nNucleo: parte della cellula che contiene il DNA.");
    const res = await h.api(`/materials/${ids.material}/tools/glossario/draft`, { method: "POST", token: tokens.teacher, json: {} });
    expect(res.status).toBe(200);
    expect((await res.json()) as Tool).toMatchObject({ kind: "glossario", shared: false, untouched: true });
    const sent = JSON.stringify(h.anthropicRequests.slice(before));
    expect(sent).toContain("Il nucleo contiene il DNA");
    expect(sent).not.toContain("Cognome");
    expect(((await (await shared(tokens.student)).json()) as { tools: unknown[] }).tools).toEqual([]);
  });

  it("gli strumenti del docente non si possono condividere; il glossario si', per sua scelta", async () => {
    const no = await h.api(`/materials/${ids.material}/tools/errori_tipici`, { method: "PUT", token: tokens.teacher, json: { body: "Confondere cellula e atomo.", shared: true } });
    expect(no.status).toBe(400);
    const ok = await h.api(`/materials/${ids.material}/tools/errori_tipici`, { method: "PUT", token: tokens.teacher, json: { body: "Confondere cellula e atomo." } });
    expect(ok.status).toBe(200);

    const share = await h.api(`/materials/${ids.material}/tools/glossario`, { method: "PUT", token: tokens.teacher, json: { body: "Cellula: la più piccola unità vivente.", shared: true } });
    expect((await share.json()) as Tool).toMatchObject({ shared: true, untouched: false });
    const seen = (await (await shared(tokens.student)).json()) as { tools: Array<{ kind: string; body: string }> };
    expect(seen.tools).toEqual([{ kind: "glossario", language: null, body: "Cellula: la più piccola unità vivente." }]);
    expect(JSON.stringify(seen)).not.toContain("atomo");
    expect((await shared(tokens.outsider)).status).toBe(404);
    const mine = (await (await h.api(`/me/shared-tools`, { token: tokens.student })).json()) as { materialIds: number[] };
    expect(mine.materialIds).toContain(ids.material);
  });

  it("una nuova stesura dell'assistente toglie la condivisione", async () => {
    h.anthropicReplies(() => "Glossario rigenerato dall'assistente, ancora da rileggere.");
    await h.api(`/materials/${ids.material}/tools/glossario/draft`, { method: "POST", token: tokens.teacher, json: {} });
    expect(((await (await shared(tokens.student)).json()) as { tools: unknown[] }).tools).toEqual([]);
  });

  it("la traduzione chiede una lingua dell'elenco e la passa all'assistente", async () => {
    expect((await h.api(`/materials/${ids.material}/tools/traduzione/draft`, { method: "POST", token: tokens.teacher, json: {} })).status).toBe(400);
    expect((await h.api(`/materials/${ids.material}/tools/traduzione/draft`, { method: "POST", token: tokens.teacher, json: { language: "Klingon" } })).status).toBe(400);
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() => "The cell is the basic unit of living things. cellula = cell");
    const res = await h.api(`/materials/${ids.material}/tools/traduzione/draft`, { method: "POST", token: tokens.teacher, json: { language: "Inglese" } });
    expect((await res.json()) as Tool).toMatchObject({ language: "Inglese", shared: false });
    expect(JSON.stringify(h.anthropicRequests.slice(before))).toContain("Scrivi il testo in Inglese");
  });

  it("il ripasso da ascoltare e' un copione che il docente puo' condividere", async () => {
    const before = h.anthropicRequests.length;
    h.anthropicReplies(() => "## La cellula\nLa cellula è l'unità fondamentale dei viventi.\n\n## Prova tu\nChe cosa contiene il nucleo?");
    const res = await h.api(`/materials/${ids.material}/tools/ripasso_audio/draft`, { method: "POST", token: tokens.teacher, json: {} });
    expect(res.status).toBe(200);
    expect(JSON.stringify(h.anthropicRequests.slice(before))).toContain("DA ASCOLTARE");
    const body = "## La cellula\nRiletto dal docente.";
    const share = await h.api(`/materials/${ids.material}/tools/ripasso_audio`, { method: "PUT", token: tokens.teacher, json: { body, shared: true } });
    expect(share.status).toBe(200);
    const seen = (await (await shared(tokens.student)).json()) as { tools: Array<{ kind: string; body: string }> };
    expect(seen.tools).toContainEqual({ kind: "ripasso_audio", language: null, body });
    await h.api(`/materials/${ids.material}/tools/ripasso_audio`, { method: "DELETE", token: tokens.teacher });
  });

  it("strumento sconosciuto rifiutato; eliminazione", async () => {
    expect((await h.api(`/materials/${ids.material}/tools/oroscopo`, { method: "PUT", token: tokens.teacher, json: { body: "x" } })).status).toBe(400);
    expect((await h.api(`/materials/${ids.material}/tools/errori_tipici`, { method: "DELETE", token: tokens.teacher })).status).toBe(204);
    const list = (await (await h.api(`/materials/${ids.material}/tools`, { token: tokens.teacher })).json()) as { tools: Tool[] };
    expect(list.tools.map((t) => t.kind).sort()).toEqual(["glossario", "traduzione"]);
  });
});
