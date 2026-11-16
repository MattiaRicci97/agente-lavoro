import { describe, it, expect } from "vitest";
import { parseGeneratedTest, scoreAttempt, cleanAnswers, itemStats } from "../../src/lib/invalsi";

const good = (n: number, correctIndex = 0) => ({
  question: `Quesito numero ${n}`,
  options: ["uno", "due", "tre", "quattro"],
  correctIndex,
  explanation: "perché sì",
  area: "Numeri",
});

describe("parseGeneratedTest", () => {
  it("scarta i quesiti malformati e tiene gli altri", () => {
    const out = parseGeneratedTest({
      title: "Prova di numeri",
      passage: "   ",
      items: [
        good(1),
        { ...good(2), options: ["a", "b", "c"] },
        { ...good(3), correctIndex: 4 },
        { ...good(4), options: ["uguale", "Uguale", "c", "d"] },
        "non un quesito",
        good(5, 3),
      ],
    });
    expect(out.title).toBe("Prova di numeri");
    expect(out.passage).toBeNull();
    expect(out.items.map((i) => i.question)).toEqual(["Quesito numero 1", "Quesito numero 5"]);
  });

  it("rifiuta una risposta senza la forma attesa", () => {
    expect(() => parseGeneratedTest({ items: [] })).toThrow();
  });
});

describe("correzione", () => {
  const items = [
    { id: 1, correctIndex: 0 },
    { id: 2, correctIndex: 2 },
    { id: 3, correctIndex: 1 },
  ];

  it("tiene solo risposte a quesiti della prova, con indice valido", () => {
    expect(cleanAnswers(items, { "1": 0, "2": 9, "3": "1", "99": 2 })).toEqual({ "1": 0, "2": null, "3": null });
  });

  it("in bianco e sbagliata valgono zero", () => {
    expect(scoreAttempt(items, { "1": 0, "2": null, "3": 3 })).toEqual({ score: 1, total: 3 });
  });

  it("per ogni quesito conta corrette, bianche e l'errore piu' scelto", () => {
    const stats = itemStats(items, [
      { answers: { "1": 0, "2": 1, "3": null } },
      { answers: { "1": 0, "2": 1, "3": 1 } },
      { answers: { "1": 3, "2": 2, "3": null } },
    ]);
    expect(stats).toEqual([
      { id: 1, correct: 2, answered: 3, blank: 0, topWrongIndex: 3 },
      { id: 2, correct: 1, answered: 3, blank: 0, topWrongIndex: 1 },
      { id: 3, correct: 1, answered: 1, blank: 2, topWrongIndex: null },
    ]);
  });
});
