/** I formati di compito scritto e come si chiamano a schermo. */
export const EXAM_TYPE_LABELS: Record<string, string> = {
  tema: "Tema",
  versione: "Versione",
  problema: "Problema",
  esposizione: "Esposizione a voce",
  prima_prova_a: "Simulazione prima prova · Tip. A",
  prima_prova_b: "Simulazione prima prova · Tip. B",
  prima_prova_c: "Simulazione prima prova · Tip. C",
};

export const PRIMA_PROVA_TYPES = [
  { type: "prima_prova_a", short: "Tip. A", hint: "Analisi di un testo letterario" },
  { type: "prima_prova_b", short: "Tip. B", hint: "Testo argomentativo" },
  { type: "prima_prova_c", short: "Tip. C", hint: "Riflessione su temi di attualità" },
] as const;

export type AssignableExamType = "tema" | "versione" | "problema" | "esposizione" | (typeof PRIMA_PROVA_TYPES)[number]["type"];

/** Le consegne che lo studente registra a voce invece di scrivere. */
export function isSpokenAssignment(examType: string): boolean {
  return examType === "esposizione";
}

export const MAX_AUDIO_SECONDS = 180;

export function isMaturitaSimulation(examType: string): boolean {
  return examType.startsWith("prima_prova_");
}

/** Il voto in decimi sulla scala in ventesimi dell'esame di Stato. */
export function toTwentieths(gradeOutOfTen: number): number {
  return Math.round(gradeOutOfTen * 2);
}
