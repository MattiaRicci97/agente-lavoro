import { describe, it, expect } from "vitest";
import { parseDiagnosis } from "../../src/lib/ai";

const candidates = [
  { code: "MAT1.ALG.05", title: "Equazioni di primo grado" },
  { code: "MAT1.ALG.07", title: "Disequazioni di primo grado" },
];

describe("parseDiagnosis", () => {
  it("accetta righe ben formate e tiene solo i codici tra i candidati", () => {
    const out = parseDiagnosis(
      [
        { exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "x = 3" },
        { exercise: "Es. 2", objectiveCode: "INVENTATO", outcome: "errato", errorType: "procedurale", evidence: "ha diviso per zero" },
      ],
      candidates,
    );
    expect(out).toEqual([
      { exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: null, evidence: "x = 3" },
      { exercise: "Es. 2", objectiveCode: null, outcome: "errato", errorType: "procedurale", evidence: "ha diviso per zero" },
    ]);
  });

  it("un errore senza obiettivo o senza tipo diventa 'non_classificato', mai un obiettivo nuovo", () => {
    const out = parseDiagnosis(
      [
        { exercise: "Es. 3", objectiveCode: null, outcome: "errato", errorType: null, evidence: "" },
        { exercise: "Es. 4", objectiveCode: "MAT1.ALG.07", outcome: "parziale", evidence: "segno sbagliato" },
      ],
      candidates,
    );
    expect(out[0]).toMatchObject({ objectiveCode: null, errorType: "non_classificato" });
    expect(out[1]).toMatchObject({ objectiveCode: "MAT1.ALG.07", errorType: "non_classificato" });
  });

  it("un esercizio corretto non porta mai un tipo di errore", () => {
    const out = parseDiagnosis(
      [{ exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "corretto", errorType: "distrazione", evidence: "" }],
      candidates,
    );
    expect(out[0].errorType).toBeNull();
  });

  it("una diagnosi malformata non blocca la correzione: torna vuota", () => {
    expect(parseDiagnosis(undefined, candidates)).toEqual([]);
    expect(parseDiagnosis("testo", candidates)).toEqual([]);
    expect(parseDiagnosis([{ exercise: "Es. 1", outcome: "boh" }], candidates)).toEqual([]);
    expect(parseDiagnosis([{ outcome: "errato" }], candidates)).toEqual([]);
  });

  it("senza candidati l'obiettivo e' sempre null, ma il tipo di errore resta", () => {
    const out = parseDiagnosis(
      [{ exercise: "Es. 1", objectiveCode: "MAT1.ALG.05", outcome: "errato", errorType: "concettuale", evidence: "" }],
      [],
    );
    expect(out[0]).toMatchObject({ objectiveCode: null, errorType: "concettuale" });
  });
});
