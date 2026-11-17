import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "../helpers/harness";

/**
 * Il ciclo della diagnosi: consegna -> proposta salvata "da_validare" ->
 * invisibile allo studente -> coda del docente con obiettivi tra cui
 * scegliere -> firma con correzioni e scarti -> visibile allo studente.
 */
const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Diagnosi dentro la correzione", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;

  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ids = { institution: 0, otherInstitution: 0, teacher: 0, otherTeacher: 0, cls: 0, material: 0, exam: 0, alg05: 0, alg06: 0, alg07: 0 };
  const tokens = { teacher: "", otherTeacher: "", student: "" };
  const studentName = `Alunno ${run}`;
  let submissionId = 0;

  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T> => (await db.execute(q)).rows[0] as T;

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));

    tokens.teacher = h.tokenFor({ id: `t-${run}`, email: `t-${run}@test.it`, role: "docente", name: "Prof" });
    tokens.otherTeacher = h.tokenFor({ id: `o-${run}`, email: `o-${run}@test.it`, role: "docente", name: "Altro" });
    tokens.student = h.tokenFor({ id: `s-${run}`, email: `s-${run}@test.it`, role: "studente", name: studentName });

    ids.institution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Ist " + run}, 'Test') RETURNING id`)).id;
    ids.otherInstitution = (await one<{ id: number }>(sql`INSERT INTO institutions (name, city) VALUES (${"Altro " + run}, 'Test') RETURNING id`)).id;
    ids.teacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`t-${run}`}, 'Prof', ${`t-${run}@test.it`}) RETURNING id`)).id;
    ids.otherTeacher = (await one<{ id: number }>(sql`INSERT INTO teachers (auth_user_id, name, email) VALUES (${`o-${run}`}, 'Altro', ${`o-${run}@test.it`}) RETURNING id`)).id;
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES (${ids.institution}, ${ids.teacher}, 'docente')`);
    await db.execute(sql`INSERT INTO institution_members (institution_id, teacher_id, role) VALUES (${ids.otherInstitution}, ${ids.otherTeacher}, 'docente')`);
    ids.cls = (
      await one<{ id: number }>(
        sql`INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
            VALUES (${ids.institution}, ${ids.teacher}, '1A', '1ª Superiore', 'Prof', ${`D${run.slice(-7)}`}) RETURNING id`,
      )
    ).id;
    await db.execute(sql`INSERT INTO class_teachers (class_id, teacher_id, role) VALUES (${ids.cls}, ${ids.teacher}, 'coordinatore')`);
    await db.execute(sql`INSERT INTO students (class_id, auth_user_id, name) VALUES (${ids.cls}, ${`s-${run}`}, ${studentName})`);
    ids.material = (
      await one<{ id: number }>(
        sql`INSERT INTO materials (teacher_id, title, subject, grade_level, content)
            VALUES (${ids.teacher}, ${"Equazioni " + run}, 'Matematica', '1^ Superiore', 'Equazioni e disequazioni di primo grado.') RETURNING id`,
      )
    ).id;
    await db.execute(sql`INSERT INTO material_classes (material_id, class_id) VALUES (${ids.material}, ${ids.cls})`);
    for (const [key, code] of [["alg05", "MAT1.ALG.05"], ["alg06", "MAT1.ALG.06"], ["alg07", "MAT1.ALG.07"]] as const) {
      ids[key] = (await one<{ id: number }>(sql`SELECT id FROM learning_objectives WHERE institution_id IS NULL AND code = ${code}`)).id;
    }
    // Il materiale dichiara di coprire le equazioni: deve comparire per primo tra i candidati.
    await db.execute(sql`INSERT INTO material_objectives (material_id, objective_id, source) VALUES (${ids.material}, ${ids.alg05}, 'docente')`);
    ids.exam = (
      await one<{ id: number }>(
        sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id)
            VALUES (${ids.material}, 'problema', 'Risolvi: 1) 2x+3=7  2) x/2-1=3  3) 3x-1>5', ${ids.teacher}) RETURNING id`,
      )
    ).id;
  });

  afterAll(async () => {
    if (!h) return;
    await db.execute(sql`DELETE FROM diagnosis_items WHERE auth_user_id = ${`s-${run}`}`);
    await db.execute(sql`DELETE FROM institutions WHERE id IN (${ids.institution}, ${ids.otherInstitution})`);
    await db.execute(sql`DELETE FROM materials WHERE id = ${ids.material}`);
    await db.execute(sql`DELETE FROM teachers WHERE id IN (${ids.teacher}, ${ids.otherTeacher})`);
    await h.stop();
  });

  it("alla consegna il modello riceve gli obiettivi candidati e la sua diagnosi viene salvata da validare", async () => {
    h.anthropicReplies(() =>
      JSON.stringify({
        grade: 6,
        feedback: "Buona impostazione, attenzione ai segni.",
        diagnosis: [
          { exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "x = 2" },
          { exercise: "Es. 2", objectiveCode: "MAT1.ALG.05", outcome: "errato", errorType: "procedurale", evidence: "ha sommato 1 invece di sottrarre" },
          { exercise: "Es. 3", objectiveCode: "CODICE.INVENTATO", outcome: "errato", errorType: "concettuale", evidence: "non ha invertito il verso" },
          { exercise: "Es. 4", objectiveCode: null, outcome: "parziale", errorType: null, evidence: "" },
        ],
      }),
    );

    const res = await h.api(`/written-exams/${ids.exam}/submit`, {
      method: "POST",
      token: tokens.student,
      json: { studentAnswer: "1) x=2  2) x=4 (ho sommato)  3) x>2 (sbagliato il verso)" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; grade: number | null; status: string };
    submissionId = body.id;
    expect(body).toMatchObject({ grade: null, status: "da_validare" });

    // Il prompt ha portato gli obiettivi della mappa, con quello del materiale per primo.
    const sent = JSON.stringify(h.anthropicRequests.at(-1)?.messages ?? []);
    expect(sent).toContain("MAT1.ALG.05: Equazioni di primo grado");
    expect(sent.indexOf("MAT1.ALG.05")).toBeLessThan(sent.indexOf("MAT1.ARI.01"));
    expect(sent).not.toContain("Alunno");

    const rows = (
      await db.execute(sql`SELECT exercise_label, ai_objective_id, ai_outcome, ai_error_type, status FROM diagnosis_items WHERE source_kind = 'scritto' AND source_id = ${submissionId} ORDER BY ord`)
    ).rows as Array<{ exercise_label: string; ai_objective_id: number | null; ai_outcome: string; ai_error_type: string | null; status: string }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === "da_validare")).toBe(true);
    expect(rows[0]).toMatchObject({ ai_objective_id: ids.alg05, ai_outcome: "corretto", ai_error_type: null });
    expect(rows[1]).toMatchObject({ ai_objective_id: ids.alg05, ai_error_type: "procedurale" });
    // Codice inventato: nessun obiettivo nuovo, errore non classificato (il tipo resta).
    expect(rows[2]).toMatchObject({ ai_objective_id: null, ai_error_type: "concettuale" });
    expect(rows[3]).toMatchObject({ ai_objective_id: null, ai_outcome: "parziale", ai_error_type: "non_classificato" });
  });

  it("prima della firma lo studente non vede ne' voto ne' diagnosi", async () => {
    const res = await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student });
    const [exam] = (await res.json()) as Array<{ mySubmission: { grade: number | null; diagnosis: unknown[] } }>;
    expect(exam.mySubmission.grade).toBeNull();
    expect(exam.mySubmission.diagnosis).toEqual([]);
  });

  it("la coda del docente porta la diagnosi proposta e gli obiettivi tra cui scegliere", async () => {
    const res = await h.api("/validations/pending", { token: tokens.teacher });
    const body = (await res.json()) as {
      writtenSubmissions: Array<{ id: number; diagnosis: Array<{ exercise: string; ai: { objective: { code: string } | null } }>; objectiveOptions: Array<{ code: string }> }>;
    };
    const mine = body.writtenSubmissions.find((w) => w.id === submissionId);
    expect(mine).toBeTruthy();
    expect(mine!.diagnosis.map((d) => d.exercise)).toEqual(["Es. 1", "Es. 2", "Es. 3", "Es. 4"]);
    expect(mine!.diagnosis[0].ai.objective?.code).toBe("MAT1.ALG.05");
    expect(mine!.objectiveOptions.some((o) => o.code === "MAT1.ALG.07")).toBe(true);

    const other = await h.api("/validations/pending", { token: tokens.otherTeacher });
    const otherBody = (await other.json()) as { writtenSubmissions: Array<{ id: number }> };
    expect(otherBody.writtenSubmissions.some((w) => w.id === submissionId)).toBe(false);
  });

  it("un docente estraneo non puo' firmare, e un obiettivo fuori mappa viene rifiutato", async () => {
    const items = (await db.execute(sql`SELECT id FROM diagnosis_items WHERE source_kind = 'scritto' AND source_id = ${submissionId} ORDER BY ord`)).rows as Array<{ id: number }>;

    const foreign = await h.api(`/written-submissions/${submissionId}/validate`, {
      method: "POST",
      token: tokens.otherTeacher,
      json: { grade: 10, feedback: "", diagnosis: [] },
    });
    expect(foreign.status).toBe(404);

    const bogus = await h.api(`/written-submissions/${submissionId}/validate`, {
      method: "POST",
      token: tokens.teacher,
      json: { grade: 6, feedback: "", diagnosis: [{ id: items[0].id, objectiveId: 999999 }] },
    });
    expect(bogus.status).toBe(400);
    const still = await one<{ status: string }>(sql`SELECT validation_status AS status FROM written_exam_submissions WHERE id = ${submissionId}`);
    expect(still.status).toBe("da_validare");
  });

  it("la firma conferma le righe non citate, applica le correzioni e scarta quelle rifiutate", async () => {
    const items = (await db.execute(sql`SELECT id FROM diagnosis_items WHERE source_kind = 'scritto' AND source_id = ${submissionId} ORDER BY ord`)).rows as Array<{ id: number }>;
    const res = await h.api(`/written-submissions/${submissionId}/validate`, {
      method: "POST",
      token: tokens.teacher,
      json: {
        grade: 7,
        feedback: "Rivedi i segni.",
        diagnosis: [
          // Es. 3: il docente colloca l'errore sulle disequazioni.
          { id: items[2].id, objectiveId: ids.alg07, outcome: "errato", errorType: "concettuale" },
          // Es. 4: riga che non descrive nulla di reale.
          { id: items[3].id, discard: true },
        ],
      },
    });
    expect(res.status).toBe(200);

    const rows = (
      await db.execute(sql`SELECT status, objective_id, outcome, error_type, validated_by_teacher_id FROM diagnosis_items WHERE source_kind = 'scritto' AND source_id = ${submissionId} ORDER BY ord`)
    ).rows as Array<{ status: string; objective_id: number | null; outcome: string | null; error_type: string | null; validated_by_teacher_id: number }>;
    expect(rows[0]).toMatchObject({ status: "validata", objective_id: ids.alg05, outcome: "corretto", error_type: null });
    expect(rows[1]).toMatchObject({ status: "validata", objective_id: ids.alg05, outcome: "errato", error_type: "procedurale" });
    expect(rows[2]).toMatchObject({ status: "validata", objective_id: ids.alg07, outcome: "errato", error_type: "concettuale" });
    expect(rows[3]).toMatchObject({ status: "scartata" });
    expect(rows.every((r) => r.validated_by_teacher_id === ids.teacher)).toBe(true);
  });

  it("dopo la firma lo studente vede il voto e la diagnosi firmata, senza le righe scartate", async () => {
    const res = await h.api(`/materials/${ids.material}/written-exams`, { token: tokens.student });
    const [exam] = (await res.json()) as Array<{
      mySubmission: { grade: number | null; diagnosis: Array<{ exercise: string; objective: { code: string } | null; outcome: string; errorType: string | null }> };
    }>;
    expect(exam.mySubmission.grade).toBe(7);
    expect(exam.mySubmission.diagnosis.map((d) => d.exercise)).toEqual(["Es. 1", "Es. 2", "Es. 3"]);
    expect(exam.mySubmission.diagnosis[2]).toMatchObject({ objective: { code: "MAT1.ALG.07" }, outcome: "errato", errorType: "concettuale" });
  });

  it("una risposta del modello senza diagnosi valida non blocca la consegna", async () => {
    const secondExam = (
      await one<{ id: number }>(
        sql`INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id)
            VALUES (${ids.material}, 'problema', 'Secondo compito', ${ids.teacher}) RETURNING id`,
      )
    ).id;
    h.anthropicReplies(() => JSON.stringify({ grade: 8, feedback: "Bene.", diagnosis: "non una lista" }));
    const res = await h.api(`/written-exams/${secondExam}/submit`, { method: "POST", token: tokens.student, json: { studentAnswer: "risposta" } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    const count = await one<{ n: string }>(sql`SELECT count(*)::text AS n FROM diagnosis_items WHERE source_kind = 'scritto' AND source_id = ${id}`);
    expect(count.n).toBe("0");

    // Ritirando il compito spariscono anche le diagnosi delle sue consegne.
    const del = await h.api(`/written-exams/${ids.exam}`, { method: "DELETE", token: tokens.teacher });
    expect(del.status).toBe(204);
    const left = await one<{ n: string }>(sql`SELECT count(*)::text AS n FROM diagnosis_items WHERE source_kind = 'scritto' AND source_id = ${submissionId}`);
    expect(left.n).toBe("0");
  });
});
