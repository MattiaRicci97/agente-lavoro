import { describe, it, expect } from "vitest";
import { PRIMA_PROVA_RUBRICS, EXAM_TYPES, EXAM_TYPE_NAMES, isMaturitaSimulation, toTwentieths } from "../../src/lib/examTypes";
import { parseRubric } from "../../src/lib/rubric";

describe("griglie della prima prova", () => {
  it("ogni tipologia ha 60 punti di indicatori generali e 40 di specifici", () => {
    for (const [type, rubric] of Object.entries(PRIMA_PROVA_RUBRICS)) {
      const general = rubric.slice(0, 3).reduce((sum, c) => sum + c.weight, 0);
      const specific = rubric.slice(3).reduce((sum, c) => sum + c.weight, 0);
      expect([type, general, specific]).toEqual([type, 60, 40]);
    }
  });

  it("passano il controllo delle griglie senza essere ritoccate", () => {
    for (const rubric of Object.values(PRIMA_PROVA_RUBRICS)) {
      expect(parseRubric(rubric)).toEqual(rubric);
    }
  });

  it("ogni formato ha un nome, e solo le prime prove sono simulazioni", () => {
    for (const type of EXAM_TYPES) expect(EXAM_TYPE_NAMES[type]).toBeTruthy();
    expect(EXAM_TYPES.filter(isMaturitaSimulation)).toEqual(["prima_prova_a", "prima_prova_b", "prima_prova_c"]);
    expect(Object.keys(PRIMA_PROVA_RUBRICS).sort()).toEqual(EXAM_TYPES.filter(isMaturitaSimulation));
  });

  it("il voto in decimi si legge in ventesimi", () => {
    expect([6, 7, 10].map(toTwentieths)).toEqual([12, 14, 20]);
  });
});
