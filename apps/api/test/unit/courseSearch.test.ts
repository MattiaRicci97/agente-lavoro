import { describe, it, expect } from "vitest";
import { chunkText, stripSubtitleMarkup, buildTsQuery, sourceLabel } from "../../src/lib/courseSearch";

describe("chunkText", () => {
  it("tiene insieme i paragrafi brevi e non supera la dimensione", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Paragrafo ${i} ` + "parola ".repeat(30)).join("\n\n");
    const chunks = chunkText(text, 600);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 600)).toBe(true);
    expect(chunks.join(" ")).toContain("Paragrafo 9");
  });

  it("spezza a frasi un paragrafo unico e lunghissimo, come una trascrizione", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Questa e' la frase numero ${i} della lezione.`).join(" ");
    const chunks = chunkText(text, 500);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    expect(chunks[0].endsWith(".")).toBe(true);
  });

  it("un testo vuoto non produce passaggi", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });
});

describe("stripSubtitleMarkup", () => {
  it("toglie intestazione, numeri e orari da un .vtt/.srt", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Prof>Oggi parliamo di disequazioni.\n\n2\n00:00:04.500 --> 00:00:08.000\nIl verso si inverte.";
    expect(stripSubtitleMarkup(vtt)).toBe("Oggi parliamo di disequazioni. Il verso si inverte.");
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nPrima riga\n\n2\n00:00:02,000 --> 00:00:03,000\nSeconda riga";
    expect(stripSubtitleMarkup(srt)).toBe("Prima riga Seconda riga");
  });
});

describe("buildTsQuery", () => {
  it("tiene le parole significative, in OR e con prefisso", () => {
    expect(buildTsQuery("Voglio ripassare le disequazioni di primo grado")).toBe("disequazioni:* | primo:* | grado:*");
  });
  it("non lascia passare operatori o punteggiatura", () => {
    expect(buildTsQuery("a & b | !c:* (verso)")).toBe("verso:*");
  });
  it("null quando non resta nulla da cercare", () => {
    expect(buildTsQuery("che cosa e'?")).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("cita le lezioni con la data", () => {
    expect(sourceLabel({ title: "Disequazioni", kind: "lezione", lessonDate: "2026-10-12" })).toBe("Lezione del 12 ottobre: Disequazioni");
    expect(sourceLabel({ title: "Dispensa", kind: "documento", lessonDate: null })).toBe("Dispensa");
  });
});
