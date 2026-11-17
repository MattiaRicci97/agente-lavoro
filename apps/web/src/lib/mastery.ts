export type MasteryState = "acquisito" | "fragile" | "mancante";

export interface MasteryRow {
  objective: { id: number; code: string; title: string; subject: string; gradeLevel: string };
  /** null = solo pratica: nessun docente ha ancora verificato l'obiettivo. */
  state: MasteryState | null;
  signed: { correct: number; total: number; lastAt: string | null };
  practice: { correct: number; total: number; lastAt: string | null };
}

export const STATE_LABEL: Record<MasteryState, string> = {
  acquisito: "Acquisito",
  fragile: "Fragile",
  mancante: "Da costruire",
};

export const STATE_TONE: Record<MasteryState, string> = {
  acquisito: "border-emerald-200 bg-emerald-50 text-emerald-900",
  fragile: "border-amber-200 bg-amber-50 text-amber-900",
  mancante: "border-rose-200 bg-rose-50 text-rose-900",
};

export const PRACTICE_ONLY_LABEL = "In esercizio";
export const PRACTICE_ONLY_TONE = "border-slate-200 bg-slate-50 text-slate-700";
