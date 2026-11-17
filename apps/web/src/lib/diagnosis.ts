export type DiagnosisOutcome = "corretto" | "parziale" | "errato";
export type DiagnosisErrorType = "concettuale" | "procedurale" | "distrazione" | "non_classificato";

export interface ObjectiveRef {
  id: number;
  code: string;
  title: string;
}

/** La riga come arriva al docente: proposta e, dopo la firma, decisione. */
export interface DiagnosisRow {
  id: number;
  exercise: string;
  ai: {
    objective: ObjectiveRef | null;
    outcome: DiagnosisOutcome;
    errorType: DiagnosisErrorType | null;
    evidence: string;
  };
  teacher: { objective: ObjectiveRef | null; outcome: DiagnosisOutcome; errorType: DiagnosisErrorType | null } | null;
  status: "da_validare" | "validata" | "scartata";
}

/** La riga come arriva allo studente: solo la versione firmata. */
export interface StudentDiagnosisRow {
  exercise: string;
  objective: ObjectiveRef | null;
  outcome: DiagnosisOutcome;
  errorType: DiagnosisErrorType | null;
  evidence: string;
}

/** Cosa il docente manda alla firma, riga per riga. */
export interface DiagnosisDecision {
  id: number;
  objectiveId?: number | null;
  outcome?: DiagnosisOutcome;
  errorType?: DiagnosisErrorType | null;
  discard?: boolean;
}

export const OUTCOME_LABEL: Record<DiagnosisOutcome, string> = {
  corretto: "Corretto",
  parziale: "In parte",
  errato: "Errato",
};

export const OUTCOME_TONE: Record<DiagnosisOutcome, string> = {
  corretto: "border-emerald-200 bg-emerald-50 text-emerald-900",
  parziale: "border-amber-200 bg-amber-50 text-amber-900",
  errato: "border-rose-200 bg-rose-50 text-rose-900",
};

export const ERROR_TYPE_LABEL: Record<DiagnosisErrorType, string> = {
  concettuale: "Concetto da riprendere",
  procedurale: "Procedimento da sistemare",
  distrazione: "Svista o calcolo",
  non_classificato: "Da chiarire",
};

/** Spiegazione breve, rivolta allo studente, sempre sull'esercizio e mai sulla persona. */
export const ERROR_TYPE_STUDENT_HINT: Record<DiagnosisErrorType, string> = {
  concettuale: "qui conviene ripartire dalla spiegazione dell'argomento",
  procedurale: "l'idea c'era: da rivedere i passaggi",
  distrazione: "un errore di attenzione: basta rileggere con calma",
  non_classificato: "chiedi al docente cosa non ha funzionato",
};
