import type { GuidedActivitySession } from "@sillabo/db";

/**
 * Sotto questa soglia di attivita' completate il riepilogo non mostra ne'
 * segnali ne' punti di blocco: con una o due persone equivarrebbe a parlare
 * di loro.
 */
export const MIN_COMPLETED_FOR_DETAIL = 3;

export interface GuidedClassSummary {
  classSize: number;
  started: number;
  completed: number;
  /** false finche' non ci sono abbastanza svolgimenti per un riepilogo anonimo. */
  detailAvailable: boolean;
  objectives: Array<{ id: number; code: string; title: string; sicuro: number; incerto: number }>;
  /** Punti in cui ci si e' bloccati, senza riferimento a chi; i piu' ripetuti prima. */
  stuckPoints: Array<{ text: string; count: number }>;
}

/**
 * Il riepilogo di classe di un'attivita' guidata: solo conteggi. Non esce
 * mai da qui il nome di uno studente ne' il suo singolo svolgimento.
 */
export function summarizeSessions(input: {
  classSize: number;
  objectives: Array<{ id: number; code: string; title: string }>;
  sessions: Array<Pick<GuidedActivitySession, "signals" | "stuckPoints" | "completedAt">>;
}): GuidedClassSummary {
  const done = input.sessions.filter((s) => s.completedAt !== null);
  const base = {
    classSize: input.classSize,
    started: input.sessions.length,
    completed: done.length,
  };
  if (done.length < MIN_COMPLETED_FOR_DETAIL) {
    return { ...base, detailAvailable: false, objectives: [], stuckPoints: [] };
  }

  const objectives = input.objectives.map((o) => {
    let sicuro = 0;
    let incerto = 0;
    for (const s of done) {
      const hit = s.signals.find((x) => x.objectiveId === o.id);
      if (hit?.level === "sicuro") sicuro += 1;
      else if (hit?.level === "incerto") incerto += 1;
    }
    return { ...o, sicuro, incerto };
  });

  const counts = new Map<string, { text: string; count: number }>();
  for (const s of done) {
    // Uno stesso studente conta una volta sola per ciascun punto.
    for (const key of new Set(s.stuckPoints.map((p) => p.trim().toLowerCase()).filter(Boolean))) {
      const text = s.stuckPoints.find((p) => p.trim().toLowerCase() === key)!.trim();
      const entry = counts.get(key) ?? { text, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const stuckPoints = Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "it"))
    .slice(0, 12);

  return { ...base, detailAvailable: true, objectives, stuckPoints };
}
