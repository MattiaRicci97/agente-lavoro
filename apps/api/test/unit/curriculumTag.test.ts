import { describe, it, expect } from "vitest";
import { parseCurriculumTag, extractJson } from "../../src/lib/ai";

const candidates = [
  { code: "MAT1.ALG.05", title: "Equazioni di primo grado" },
  { code: "MAT1.ALG.06", title: "Problemi con equazioni di primo grado" },
  { code: "MAT1.ALG.07", title: "Disequazioni di primo grado" },
];

describe("extractJson", () => {
  it("legge JSON nudo, in blocco ```json e con testo attorno", () => {
    expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
    expect(extractJson<{ a: number }>('Ecco:\n```json\n{"a": 2}\n```\nFine.')).toEqual({ a: 2 });
    expect(extractJson<{ a: number }>('Risposta: {"a": 3} grazie')).toEqual({ a: 3 });
    expect(extractJson<number[]>("[1,2]")).toEqual([1, 2]);
  });

  it("segnala in italiano una risposta troncata", () => {
    expect(() => extractJson('{"a": ')).toThrow(/incompleta/);
  });
});

describe("parseCurriculumTag", () => {
  it("accetta la forma attesa e tiene solo i codici che esistono tra i candidati", () => {
    const out = parseCurriculumTag(
      { topic: "Algebra", subtopic: "Equazioni", objectiveCodes: ["MAT1.ALG.05", "INVENTATO", "MAT1.ALG.05", "MAT1.ALG.07"] },
      candidates,
    );
    expect(out).toEqual({ topic: "Algebra", subtopic: "Equazioni", objectiveCodes: ["MAT1.ALG.05", "MAT1.ALG.07"] });
  });

  it("senza candidati non puo' restituire alcun codice", () => {
    const out = parseCurriculumTag({ topic: "Algebra", subtopic: "", objectiveCodes: ["MAT1.ALG.05"] }, []);
    expect(out.objectiveCodes).toEqual([]);
  });

  it("tollera i campi facoltativi assenti", () => {
    const out = parseCurriculumTag({ topic: "Geometria" }, candidates);
    expect(out).toEqual({ topic: "Geometria", subtopic: "", objectiveCodes: [] });
  });

  it("al massimo cinque obiettivi per materiale", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ code: `C${i}`, title: `T${i}` }));
    const out = parseCurriculumTag({ topic: "X", objectiveCodes: many.map((c) => c.code) }, many);
    expect(out.objectiveCodes).toHaveLength(5);
  });

  it("rifiuta una risposta senza topic o con tipi sbagliati", () => {
    expect(() => parseCurriculumTag({ subtopic: "x" }, candidates)).toThrow(/formato/);
    expect(() => parseCurriculumTag({ topic: "ok", objectiveCodes: "MAT1.ALG.05" }, candidates)).toThrow(/formato/);
    expect(() => parseCurriculumTag("stringa", candidates)).toThrow(/formato/);
  });
});
