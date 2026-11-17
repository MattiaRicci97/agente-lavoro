import { describe, it, expect } from "vitest";
import { fromTenths, formatGrade, isValidGrade, scaleFor, LODE } from "../../src/lib/gradeScale";
import { adaptSystemPrompt } from "../../src/lib/audience";

describe("scala dei voti", () => {
  it("ogni tipo d'istituto ha la sua scala, e l'istituto puo' sceglierne un'altra", () => {
    expect(scaleFor("scuola")).toBe("decimi");
    expect(scaleFor("universita")).toBe("trentesimi");
    expect(scaleFor("business_school")).toBe("centesimi");
    expect(scaleFor("universita", "centesimi")).toBe("centesimi");
    expect(scaleFor("sconosciuto", "boh")).toBe("decimi");
  });

  it("le proposte in decimi si convertono tenendo la sufficienza al suo posto, mai con la lode", () => {
    expect(fromTenths(6, "trentesimi")).toBe(18);
    expect(fromTenths(10, "trentesimi")).toBe(30);
    expect(fromTenths(6, "centesimi")).toBe(60);
    expect(fromTenths(7.4, "decimi")).toBe(7);
    expect(fromTenths(null, "trentesimi")).toBeNull();
  });

  it("i voti fuori scala non passano", () => {
    expect(isValidGrade(0, "decimi")).toBe(false);
    expect(isValidGrade(10, "decimi")).toBe(true);
    expect(isValidGrade(LODE, "trentesimi")).toBe(true);
    expect(isValidGrade(32, "trentesimi")).toBe(false);
    expect(isValidGrade(100, "centesimi")).toBe(true);
    expect(isValidGrade(7.5, "decimi")).toBe(false);
  });

  it("si scrivono come li scrive chi li usa", () => {
    expect(formatGrade(7, "decimi")).toBe("7/10");
    expect(formatGrade(27, "trentesimi")).toBe("27/30");
    expect(formatGrade(LODE, "trentesimi")).toBe("30 e lode");
    expect(formatGrade(78, "centesimi")).toBe("78/100");
  });
});

describe("assistente al livello dell'istituto", () => {
  const base = "Sei un docente italiano di scuola superiore che prepara la griglia di valutazione.";

  it("a scuola le istruzioni restano com'erano", () => {
    expect(adaptSystemPrompt(base, "scuola")).toBe(base);
  });

  it("all'universita' e in business school cambiano ruolo e contesto", () => {
    const uni = adaptSystemPrompt(base, "universita");
    expect(uni).toContain("docente universitario italiano");
    expect(uni).toContain("corso universitario");
    const bs = adaptSystemPrompt(base, "business_school");
    expect(bs).toContain("business school");
    expect(bs).toContain("partecipante");
    expect(bs).not.toContain("di scuola superiore");
  });
});
