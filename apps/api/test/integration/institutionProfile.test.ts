import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/** Il tipo di istituto: chi puo' cambiarlo e cosa cambia per docenti e studenti. */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Profilo d'istituto", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, admin: 0, colleague: 0, outsider: 0, cls: 0 };
  const tokens = { admin: "", colleague: "", outsider: "", student: "" };
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;
  type Profile = { kind: string; hidden: string[]; terms: { group: string; learner: string }; adminInstitutions: Array<{ id: number }> };
  const profile = async (token: string) => (await (await h.api(`/me/profile`, { token })).json()) as Profile;

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    tokens.admin = h.tokenFor({ id: `ka-${run}`, email: `ka-${run}@t.it`, role: "docente", name: "Dirigente" });
    tokens.colleague = h.tokenFor({ id: `kc-${run}`, email: `kc-${run}@t.it`, role: "docente", name: "Collega" });
    tokens.outsider = h.tokenFor({ id: `ko-${run}`, email: `ko-${run}@t.it`, role: "docente", name: "Altro" });
    tokens.student = h.tokenFor({ id: `ks-${run}`, email: `ks-${run}@t.it`, role: "studente", name: "Anna" });
    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Ateneo " + run}, 'Test') RETURNING id`)).id;
    ids.admin = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ka-${run}`}, 'Dirigente', 'a@t.it') RETURNING id`)).id;
    ids.colleague = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`kc-${run}`}, 'Collega', 'c@t.it') RETURNING id`)).id;
    ids.outsider = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`ko-${run}`}, 'Altro', 'o@t.it') RETURNING id`)).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES
      (${ids.institution}, ${ids.admin}, 'amministratore'), (${ids.institution}, ${ids.colleague}, 'docente')`);
    ids.cls = (
      await one<{ id: number }>(sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
        VALUES (${ids.institution}, ${ids.colleague}, 'Analisi I', '1ª Superiore', 'Collega', ${`K${run.slice(-7)}`}) RETURNING id`)
    ).id;
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`ks-${run}`}, 'Anna')`);
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM institutions WHERE id = ${ids.institution}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.admin}, ${ids.colleague}, ${ids.outsider})`);
    await h.stop();
  });

  it("un istituto nasce scuola; solo l'amministratore lo vede tra quelli che puo' cambiare", async () => {
    const admin = await profile(tokens.admin);
    expect(admin.kind).toBe("scuola");
    expect(admin.adminInstitutions.map((i) => i.id)).toContain(ids.institution);
    expect((await profile(tokens.colleague)).adminInstitutions).toEqual([]);
  });

  it("solo l'amministratore cambia il tipo; un collega no, un estraneo nemmeno lo vede", async () => {
    const body = { kind: "universita" };
    expect((await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.outsider, json: body })).status).toBe(404);
    expect((await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.colleague, json: body })).status).toBe(403);
    expect((await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.admin, json: { kind: "convento" } })).status).toBe(400);
    expect((await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.admin, json: body })).status).toBe(200);
  });

  it("diventata universita', docenti e studenti vedono corsi al posto delle classi e niente adempimenti scolastici", async () => {
    for (const token of [tokens.colleague, tokens.student]) {
      const p = await profile(token);
      expect(p.kind).toBe("universita");
      expect(p.terms.group).toBe("corso");
      expect(p.hidden).toEqual(expect.arrayContaining(["registro", "scrutinio", "invalsi", "maturita"]));
    }
  });

  it("all'universita' la mappa non contiene il catalogo nazionale, solo gli obiettivi dell'ateneo", async () => {
    const list = async () =>
      ((await (await h.api(`/institutions/${ids.institution}/objectives?includeInactive=1`, { token: tokens.admin })).json()) as { objectives: Array<{ source: string }> }).objectives;
    expect(await list()).toEqual([]);
    const created = await h.api(`/institutions/${ids.institution}/objectives`, {
      method: "POST",
      token: tokens.admin,
      json: { subject: "Analisi matematica", gradeLevel: "Primo anno", title: "Calcolare limiti di funzioni", description: "Limiti notevoli e forme indeterminate." },
    });
    expect(created.status).toBe(201);
    const after = await list();
    expect(after).toHaveLength(1);
    expect(after[0].source).toBe("istituto");
  });

  it("tornata scuola, il catalogo nazionale ricompare insieme agli obiettivi dell'istituto", async () => {
    await h.api(`/institutions/${ids.institution}/kind`, { method: "PUT", token: tokens.admin, json: { kind: "scuola" } });
    const res = await h.api(`/institutions/${ids.institution}/objectives?includeInactive=1`, { token: tokens.admin });
    const objectives = ((await res.json()) as { objectives: Array<{ source: string }> }).objectives;
    expect(objectives.some((o) => o.source === "sillabo")).toBe(true);
    expect(objectives.some((o) => o.source === "istituto")).toBe(true);
  });
});
