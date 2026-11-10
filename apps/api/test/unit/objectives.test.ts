import { describe, it, expect } from "vitest";
import { mergeObjectives, normalizeGradeLevel } from "../../src/lib/objectives";
import type { LearningObjective, InstitutionObjectiveOverride } from "@sillabo/db";

function objective(partial: Partial<LearningObjective> & { id: number; code: string }): LearningObjective {
  return {
    institutionId: null,
    subject: "Matematica",
    gradeLevel: "1ª Superiore",
    title: `Titolo ${partial.code}`,
    description: "",
    reviewStatus: "bozza_da_rivedere",
    active: true,
    ord: partial.id,
    createdByTeacherId: null,
    createdAt: new Date("2026-01-01"),
    ...partial,
  };
}

function override(partial: Partial<InstitutionObjectiveOverride> & { objectiveId: number }): InstitutionObjectiveOverride {
  return {
    id: 1,
    institutionId: 7,
    title: null,
    description: null,
    active: null,
    reviewedByTeacherId: null,
    reviewedAt: null,
    updatedAt: new Date("2026-01-01"),
    ...partial,
  };
}

describe("mergeObjectives", () => {
  it("il catalogo base passa inalterato quando l'istituto non ha adattamenti", () => {
    const out = mergeObjectives({
      base: [objective({ id: 1, code: "A" }), objective({ id: 2, code: "B" })],
      own: [],
      overrides: [],
      prerequisites: [],
    });
    expect(out.map((o) => o.code)).toEqual(["A", "B"]);
    expect(out[0]).toMatchObject({ source: "sillabo", customized: false, reviewStatus: "bozza_da_rivedere", active: true });
  });

  it("l'override dell'istituto vince su titolo, descrizione e attivazione, campo per campo", () => {
    const out = mergeObjectives({
      base: [objective({ id: 1, code: "A", title: "Base", description: "Desc base" })],
      own: [],
      overrides: [override({ objectiveId: 1, title: "Nostro titolo", active: false })],
      prerequisites: [],
    });
    expect(out[0]).toMatchObject({
      title: "Nostro titolo",
      description: "Desc base",
      active: false,
      customized: true,
    });
  });

  it("la conferma del dipartimento rende l'obiettivo 'rivisto' senza toccare il catalogo base", () => {
    const base = objective({ id: 1, code: "A" });
    const out = mergeObjectives({
      base: [base],
      own: [],
      overrides: [override({ objectiveId: 1, reviewedAt: new Date(), reviewedByTeacherId: 3 })],
      prerequisites: [],
    });
    expect(out[0].reviewStatus).toBe("rivisto");
    expect(out[0].customized).toBe(false);
    expect(base.reviewStatus).toBe("bozza_da_rivedere");
  });

  it("gli obiettivi dell'istituto sono marcati 'istituto' e seguono il proprio stato", () => {
    const out = mergeObjectives({
      base: [],
      own: [objective({ id: 10, code: "IST.01", institutionId: 7, reviewStatus: "rivisto" })],
      overrides: [],
      prerequisites: [],
    });
    expect(out[0]).toMatchObject({ source: "istituto", reviewStatus: "rivisto", customized: false });
  });

  it("le propedeuticita' si risolvono in codici, anche verso obiettivi di un altro anno", () => {
    const out = mergeObjectives({
      base: [
        objective({ id: 1, code: "MAT1.ALG.05", gradeLevel: "1ª Superiore" }),
        objective({ id: 2, code: "MAT2.ALG.01", gradeLevel: "2ª Superiore" }),
      ],
      own: [objective({ id: 3, code: "IST.01", institutionId: 7, gradeLevel: "2ª Superiore" })],
      overrides: [],
      prerequisites: [
        { objectiveId: 2, requiresObjectiveId: 1 },
        { objectiveId: 3, requiresObjectiveId: 2 },
        { objectiveId: 3, requiresObjectiveId: 999 },
      ],
    });
    const byCode = new Map(out.map((o) => [o.code, o]));
    expect(byCode.get("MAT2.ALG.01")?.requires).toEqual(["MAT1.ALG.05"]);
    // Un prerequisito sconosciuto non produce un codice fantasma.
    expect(byCode.get("IST.01")?.requires).toEqual(["MAT2.ALG.01"]);
    expect(byCode.get("IST.01")?.requiresIds).toEqual([2, 999]);
  });

  it("ordina per materia, anno e poi per ord", () => {
    const out = mergeObjectives({
      base: [
        objective({ id: 1, code: "Z", subject: "Storia", ord: 0 }),
        objective({ id: 2, code: "B", ord: 2 }),
        objective({ id: 3, code: "A", ord: 1 }),
        objective({ id: 4, code: "C", gradeLevel: "2ª Superiore", ord: 0 }),
      ],
      own: [],
      overrides: [],
      prerequisites: [],
    });
    expect(out.map((o) => o.code)).toEqual(["A", "B", "C", "Z"]);
  });
});

describe("normalizeGradeLevel", () => {
  it("riconduce le varianti grafiche dell'anno alla stessa etichetta", () => {
    expect(normalizeGradeLevel("1^ Superiore")).toBe("1ª Superiore");
    expect(normalizeGradeLevel("1ª Superiore")).toBe("1ª Superiore");
    expect(normalizeGradeLevel("  2^   Superiore ")).toBe("2ª Superiore");
    expect(normalizeGradeLevel("3 superiore")).toBe("3ª Superiore");
    expect(normalizeGradeLevel("2 media")).toBe("2ª Media");
  });

  it("lascia stare etichette che non conosce", () => {
    expect(normalizeGradeLevel("Biennio")).toBe("Biennio");
  });
});
