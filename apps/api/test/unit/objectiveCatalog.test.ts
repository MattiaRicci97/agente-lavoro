import { describe, it, expect } from "vitest";
import { OBJECTIVE_CATALOG, validateObjectiveCatalog } from "../../../../packages/db/src/seed/objectives";

describe("catalogo base degli obiettivi", () => {
  it("e' coerente: codici unici e prerequisiti che esistono prima", () => {
    expect(validateObjectiveCatalog(OBJECTIVE_CATALOG)).toEqual([]);
  });

  it("copre le materie e gli anni attesi", () => {
    const scopes = OBJECTIVE_CATALOG.map((g) => `${g.subject} ${g.gradeLevel}`);
    expect(scopes).toEqual([
      "Matematica 1ª Superiore",
      "Matematica 2ª Superiore",
      "Matematica 3ª Superiore",
      "Matematica 4ª Superiore",
      "Matematica 5ª Superiore",
      "Italiano 1ª Superiore",
      "Italiano 2ª Superiore",
      "Inglese 1ª Superiore",
      "Inglese 2ª Superiore",
      "Fisica 1ª Superiore",
      "Fisica 2ª Superiore",
    ]);
    for (const g of OBJECTIVE_CATALOG) expect(g.objectives.length).toBeGreaterThanOrEqual(8);
  });

  it("i codici dicono materia e anno dell'obiettivo", () => {
    const prefix: Record<string, string> = { Matematica: "MAT", Italiano: "ITA", Inglese: "ING", Fisica: "FIS" };
    for (const g of OBJECTIVE_CATALOG) {
      const expected = `${prefix[g.subject]}${g.gradeLevel[0]}.`;
      for (const o of g.objectives) expect(o.code.startsWith(expected), `${o.code} in ${g.subject} ${g.gradeLevel}`).toBe(true);
    }
  });

  it("il controllo segnala doppioni, prerequisiti mancanti e rimandi in avanti", () => {
    const problems = validateObjectiveCatalog([
      {
        subject: "Prova",
        gradeLevel: "1ª Superiore",
        objectives: [
          { code: "P1", title: "Uno", description: "d", requires: ["P2"] },
          { code: "P2", title: "Due", description: "d", requires: ["INESISTENTE"] },
          { code: "P2", title: "Doppione", description: "d" },
        ],
      },
    ]);
    expect(problems).toHaveLength(3);
  });
});
