import { describe, it, expect } from "vitest";
import { resolveProfile, usesNationalCatalog, PROFILES, OPTIONAL_FEATURES } from "../../src/lib/institutionProfile";

describe("profilo d'istituto", () => {
  it("senza istituti, o con tipi sconosciuti, vale la scuola", () => {
    expect(resolveProfile([]).kind).toBe("scuola");
    expect(resolveProfile(["accademia_segreta"]).kind).toBe("scuola");
  });

  it("istituti tutti dello stesso tipo danno quel profilo", () => {
    expect(resolveProfile(["universita", "universita"]).kind).toBe("universita");
    expect(resolveProfile(["business_school"]).terms.learner).toBe("partecipante");
  });

  it("tipi diversi insieme mostrano tutto: meglio una funzione in piu' che una che manca", () => {
    const p = resolveProfile(["universita", "scuola"]);
    expect(p.kind).toBe("scuola");
    expect(p.hidden).toEqual([]);
  });

  it("la scuola non nasconde nulla; universita' e business school nascondono gli adempimenti scolastici", () => {
    expect(PROFILES.scuola.hidden).toEqual([]);
    for (const kind of ["universita", "business_school"] as const) {
      expect(PROFILES[kind].hidden).toEqual(expect.arrayContaining(["registro", "scrutinio", "invalsi", "maturita", "edfin"]));
      expect(PROFILES[kind].terms.group).toBe("corso");
      for (const f of PROFILES[kind].hidden) expect(OPTIONAL_FEATURES).toContain(f);
    }
  });

  it("il catalogo nazionale degli obiettivi vale solo per le scuole", () => {
    expect(usesNationalCatalog(["scuola"])).toBe(true);
    expect(usesNationalCatalog(["universita"])).toBe(false);
    expect(usesNationalCatalog([])).toBe(true);
  });
});
