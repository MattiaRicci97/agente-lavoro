import { describe, it, expect } from "vitest";
import { summarizeSessions, MIN_COMPLETED_FOR_DETAIL } from "../../src/lib/guided";
import { parseGuidedSummary } from "../../src/lib/ai";

const objectives = [
  { id: 1, code: "A", title: "Obiettivo A" },
  { id: 2, code: "B", title: "Obiettivo B" },
];
const done = (signals: Array<{ objectiveId: number; level: "sicuro" | "incerto" }>, stuckPoints: string[] = []) => ({
  signals,
  stuckPoints,
  completedAt: new Date(),
});
const open = () => ({ signals: [], stuckPoints: [], completedAt: null });

describe("summarizeSessions", () => {
  it("sotto la soglia mostra solo i conteggi di partecipazione", () => {
    const out = summarizeSessions({
      classSize: 20,
      objectives,
      sessions: [done([{ objectiveId: 1, level: "incerto" }], ["cambio di verso"]), done([]), open()],
    });
    expect(MIN_COMPLETED_FOR_DETAIL).toBe(3);
    expect(out).toMatchObject({ classSize: 20, started: 3, completed: 2, detailAvailable: false, objectives: [], stuckPoints: [] });
  });

  it("sopra la soglia conta per obiettivo e ignora chi non ha finito", () => {
    const out = summarizeSessions({
      classSize: 20,
      objectives,
      sessions: [
        done([
          { objectiveId: 1, level: "incerto" },
          { objectiveId: 2, level: "sicuro" },
        ]),
        done([{ objectiveId: 1, level: "incerto" }]),
        done([{ objectiveId: 1, level: "sicuro" }]),
        { signals: [{ objectiveId: 1, level: "incerto" }], stuckPoints: ["non conta"], completedAt: null },
      ],
    });
    expect(out.detailAvailable).toBe(true);
    expect(out.objectives).toEqual([
      { id: 1, code: "A", title: "Obiettivo A", sicuro: 1, incerto: 2 },
      { id: 2, code: "B", title: "Obiettivo B", sicuro: 1, incerto: 0 },
    ]);
    expect(out.stuckPoints).toEqual([]);
  });

  it("i punti di blocco si sommano senza distinguere maiuscole, i piu' ripetuti prima", () => {
    const out = summarizeSessions({
      classSize: 5,
      objectives: [],
      sessions: [
        done([], ["Cambio di verso", "cambio di verso", "proprietà distributiva"]),
        done([], ["cambio di verso "]),
        done([], []),
      ],
    });
    expect(out.stuckPoints).toEqual([
      { text: "Cambio di verso", count: 2 },
      { text: "proprietà distributiva", count: 1 },
    ]);
  });
});

describe("parseGuidedSummary", () => {
  it("tiene solo gli obiettivi dell'attivita', uno per obiettivo", () => {
    const out = parseGuidedSummary(
      {
        signals: [
          { objectiveCode: "A", level: "incerto" },
          { objectiveCode: "A", level: "sicuro" },
          { objectiveCode: "Z", level: "sicuro" },
        ],
        stuckPoints: ["cambio di verso"],
      },
      ["A", "B"],
    );
    expect(out).toEqual({ signals: [{ objectiveCode: "A", level: "incerto" }], stuckPoints: ["cambio di verso"] });
  });

  it("una risposta malformata non produce nessun segnale", () => {
    expect(parseGuidedSummary({ signals: [{ objectiveCode: "A", level: "scarso" }] }, ["A"])).toEqual({ signals: [], stuckPoints: [] });
    expect(parseGuidedSummary("boh", ["A"])).toEqual({ signals: [], stuckPoints: [] });
  });
});
