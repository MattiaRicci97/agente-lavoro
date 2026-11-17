import { describe, it, expect } from "vitest";
import { normalizeHints, parseHintsDraft, parseRecoveryQuestions } from "../../src/lib/ai";

describe("normalizeHints", () => {
  it("tiene solo stringhe non vuote, al massimo tre", () => {
    expect(normalizeHints(["  uno ", "", 7, null, "due", "tre", "quattro"])).toEqual(["uno", "due", "tre"]);
  });

  it("qualsiasi cosa che non sia una lista diventa nessun aiuto", () => {
    expect(normalizeHints(undefined)).toEqual([]);
    expect(normalizeHints("un aiuto solo")).toEqual([]);
    expect(normalizeHints({ 0: "a" })).toEqual([]);
  });

  it("accorcia un aiuto troppo lungo invece di scartarlo", () => {
    const [hint] = normalizeHints(["x".repeat(500)]);
    expect(hint.length).toBe(300);
    expect(hint.endsWith("…")).toBe(true);
  });
});

describe("parseHintsDraft", () => {
  it("scarta gli aiuti riferiti a domande non richieste e quelli vuoti", () => {
    const out = parseHintsDraft(
      { items: [{ id: 1, hints: ["a", "b"] }, { id: 99, hints: ["intruso"] }, { id: 2, hints: [] }] },
      [1, 2],
    );
    expect(Array.from(out.entries())).toEqual([[1, ["a", "b"]]]);
  });

  it("rifiuta una risposta che non ha la forma attesa", () => {
    expect(() => parseHintsDraft({ hints: [] }, [1])).toThrow();
  });
});

describe("parseRecoveryQuestions con aiuti", () => {
  it("una domanda senza aiuti (o con aiuti malformati) resta valida", () => {
    const out = parseRecoveryQuestions(
      {
        questions: [
          { objectiveCode: "A", question: "Risolvi 2x = 4", answer: "x = 2", hints: ["Isola la x", "Dividi per 2"] },
          { objectiveCode: "A", question: "Risolvi 3x = 9", answer: "x = 3" },
          { objectiveCode: "A", question: "Risolvi 5x = 10", answer: "x = 2", hints: "non una lista" },
        ],
      },
      ["A"],
    );
    expect(out.map((q) => q.hints)).toEqual([["Isola la x", "Dividi per 2"], [], []]);
  });
});
