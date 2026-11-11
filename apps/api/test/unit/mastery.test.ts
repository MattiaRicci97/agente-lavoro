import { describe, it, expect } from "vitest";
import { computeMasteryState, type Evidence } from "../../src/lib/mastery";
import { parseRecoveryQuestions } from "../../src/lib/ai";

let seq = 0;
/** Ogni giorno e' una prova diversa, salvo indicazione contraria. */
function ev(source: Evidence["source"], outcome: Evidence["outcome"], day: number, ref = `prova:${day}`): Evidence {
  seq += 1;
  return { id: seq, source, outcome, at: new Date(Date.UTC(2026, 0, day)), ref };
}

describe("computeMasteryState", () => {
  it("senza evidenze firmate non c'e' stato: la pratica da sola non certifica", () => {
    expect(computeMasteryState([])).toBeNull();
    expect(computeMasteryState([ev("pratica", "corretto", 1), ev("autovalutazione", "corretto", 2)])).toBeNull();
  });

  it("acquisito quando l'ultima prova firmata e' tutta corretta: il riscontro chiude il ciclo", () => {
    expect(computeMasteryState([ev("firmato", "corretto", 1)])).toBe("acquisito");
    expect(computeMasteryState([ev("firmato", "errato", 1), ev("firmato", "corretto", 9)])).toBe("acquisito");
  });

  it("dentro la stessa prova un esercizio sbagliato basta a lasciare l'obiettivo fragile", () => {
    expect(computeMasteryState([ev("firmato", "corretto", 2, "scritto:1"), ev("firmato", "errato", 2, "scritto:1")])).toBe("fragile");
    expect(computeMasteryState([ev("firmato", "corretto", 1), ev("firmato", "parziale", 2)])).toBe("fragile");
  });

  it("mancante quando non c'e' nessuna riuscita, nemmeno parziale", () => {
    expect(computeMasteryState([ev("firmato", "errato", 1)])).toBe("mancante");
    expect(computeMasteryState([ev("firmato", "errato", 1), ev("pratica", "errato", 2)])).toBe("mancante");
  });

  it("la pratica porta da mancante a fragile, mai ad acquisito", () => {
    const events = [ev("firmato", "errato", 1), ev("autovalutazione", "corretto", 3), ev("pratica", "corretto", 4), ev("pratica", "corretto", 5)];
    expect(computeMasteryState(events)).toBe("fragile");
  });

  it("l'ordine conta per data, non per posizione nell'elenco", () => {
    const late = ev("firmato", "errato", 9);
    expect(computeMasteryState([late, ev("firmato", "corretto", 1), ev("firmato", "corretto", 2)])).toBe("fragile");
  });
});

describe("parseRecoveryQuestions", () => {
  it("tiene solo le domande degli obiettivi richiesti", () => {
    const out = parseRecoveryQuestions(
      { questions: [
        { objectiveCode: "A", question: "Risolvi 2x = 4", answer: "x = 2" },
        { objectiveCode: "ALTRO", question: "Domanda fuori tema", answer: "..." },
      ] },
      ["A"],
    );
    expect(out).toEqual([{ objectiveCode: "A", question: "Risolvi 2x = 4", answer: "x = 2" }]);
  });

  it("rifiuta una risposta malformata", () => {
    expect(() => parseRecoveryQuestions({ domande: [] }, ["A"])).toThrow(/formato/);
    expect(() => parseRecoveryQuestions({ questions: [{ objectiveCode: "A", question: "", answer: "x" }] }, ["A"])).toThrow(/formato/);
  });
});
