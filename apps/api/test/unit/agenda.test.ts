import { describe, it, expect } from "vitest";
import { buildAgenda, type AgendaItem } from "../../src/lib/agenda";

const item = (partial: Partial<AgendaItem> & { title: string }): AgendaItem => ({
  kind: "compito",
  subtitle: "Matematica",
  dueDate: null,
  link: null,
  ...partial,
});

describe("buildAgenda", () => {
  const today = "2026-11-16";

  it("mette in testa cio' che e' scaduto, poi per data, in fondo cio' che non ha scadenza", () => {
    const out = buildAgenda(
      [
        item({ title: "Senza data" }),
        item({ title: "Tra dieci giorni", dueDate: "2026-11-26" }),
        item({ title: "Oggi", dueDate: "2026-11-16" }),
        item({ title: "Scaduto", dueDate: "2026-11-13" }),
        item({ title: "Domani", dueDate: "2026-11-17" }),
        item({ title: "Venerdi'", dueDate: "2026-11-20" }),
      ],
      today,
    );
    expect(out.map((e) => [e.title, e.when, e.daysLeft])).toEqual([
      ["Scaduto", "scaduto", -3],
      ["Oggi", "oggi", 0],
      ["Domani", "domani", 1],
      ["Venerdi'", "settimana", 4],
      ["Tra dieci giorni", "piu_avanti", 10],
      ["Senza data", "senza_data", null],
    ]);
  });

  it("una verifica in calendario gia' passata sparisce; un compito scaduto resta", () => {
    const out = buildAgenda(
      [item({ kind: "verifica", title: "Verifica di ieri", dueDate: "2026-11-15" }), item({ title: "Compito di ieri", dueDate: "2026-11-15" })],
      today,
    );
    expect(out.map((e) => e.title)).toEqual(["Compito di ieri"]);
  });

  it("il conto dei giorni non sbaglia a cavallo di mese e anno", () => {
    const [entry] = buildAgenda([item({ title: "Gennaio", dueDate: "2027-01-02" })], "2026-12-30");
    expect(entry.daysLeft).toBe(3);
    expect(entry.when).toBe("settimana");
  });
});
