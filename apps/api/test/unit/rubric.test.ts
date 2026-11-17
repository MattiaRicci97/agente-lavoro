import { describe, it, expect } from "vitest";
import { parseRubric, parseRubricScores, weightedGrade, mergeTeacherScores, RubricError } from "../../src/lib/rubric";

const rubric = [
  { name: "Correttezza", description: "", weight: 50 },
  { name: "Procedimento", description: "", weight: 30 },
  { name: "Ordine", description: "", weight: 20 },
];

describe("parseRubric", () => {
  it("riporta i pesi a 100 mantenendo le proporzioni", () => {
    const out = parseRubric([
      { name: "Primo", weight: 1 },
      { name: "Secondo", weight: 1 },
      { name: "Terzo", weight: 1 },
    ]);
    expect(out.map((c) => c.weight).reduce((a, b) => a + b, 0)).toBe(100);
    expect(out.map((c) => c.weight).sort()).toEqual([33, 33, 34]);
  });

  it("rifiuta griglie con un solo criterio, anche se ripetuto", () => {
    expect(() => parseRubric([{ name: "Solo", weight: 100 }])).toThrow(RubricError);
    expect(() => parseRubric([{ name: "Uguale", weight: 50 }, { name: " uguale ", weight: 50 }])).toThrow(RubricError);
    expect(() => parseRubric("non una lista")).toThrow(RubricError);
  });
});

describe("parseRubricScores", () => {
  it("tiene solo i criteri della griglia, nell'ordine della griglia", () => {
    const out = parseRubricScores(
      [
        { criterion: "ordine", score: 7.6, note: "pulito" },
        { criterion: "Inventato", score: 10 },
        { criterion: "Correttezza", score: 6 },
        { criterion: "Correttezza", score: 2 },
        { criterion: "Procedimento", score: 42 },
      ],
      rubric,
    );
    expect(out).toEqual([
      { criterion: "Correttezza", score: 6, note: "" },
      { criterion: "Ordine", score: 8, note: "pulito" },
    ]);
  });

  it("una risposta senza punteggi non fa fallire nulla", () => {
    expect(parseRubricScores(undefined, rubric)).toEqual([]);
  });
});

describe("weightedGrade", () => {
  it("calcola la media pesata", () => {
    const scores = [
      { criterion: "Correttezza", score: 6, note: "" },
      { criterion: "Procedimento", score: 8, note: "" },
      { criterion: "Ordine", score: 10, note: "" },
    ];
    expect(weightedGrade(rubric, scores)).toBe(7.4);
  });

  it("senza tutti i criteri non suggerisce nessun voto", () => {
    expect(weightedGrade(rubric, [{ criterion: "Correttezza", score: 6, note: "" }])).toBeNull();
  });
});

describe("mergeTeacherScores", () => {
  it("il numero del docente vince, la nota resta quella della proposta", () => {
    const out = mergeTeacherScores(
      rubric,
      [
        { criterion: "Correttezza", score: 6, note: "due errori di segno" },
        { criterion: "Procedimento", score: 8, note: "chiaro" },
      ],
      [
        { criterion: "Correttezza", score: 7 },
        { criterion: "Ordine", score: 9 },
        { criterion: "Inventato", score: 1 },
      ],
    );
    expect(out).toEqual([
      { criterion: "Correttezza", score: 7, note: "due errori di segno" },
      { criterion: "Procedimento", score: 8, note: "chiaro" },
      { criterion: "Ordine", score: 9, note: "" },
    ]);
  });
});
