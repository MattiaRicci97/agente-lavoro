import type { RubricCriterion } from "@sillabo/db";

/**
 * I formati di compito scritto. Ai tre di sempre si aggiungono le simulazioni
 * della prima prova dell'esame di Stato, nelle tre tipologie ministeriali.
 */
export const EXAM_TYPES = ["tema", "versione", "problema", "prima_prova_a", "prima_prova_b", "prima_prova_c"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_TYPE_NAMES: Record<string, string> = {
  tema: "Tema",
  versione: "Versione",
  problema: "Problema",
  prima_prova_a: "Simulazione prima prova, tipologia A",
  prima_prova_b: "Simulazione prima prova, tipologia B",
  prima_prova_c: "Simulazione prima prova, tipologia C",
};

export function isMaturitaSimulation(examType: string): boolean {
  return examType.startsWith("prima_prova_");
}

/**
 * Gli indicatori generali della prima prova (60 punti su 100), comuni alle
 * tre tipologie, secondo il quadro di riferimento ministeriale.
 */
const GENERALI: RubricCriterion[] = [
  {
    name: "Organizzazione del testo",
    description: "Ideazione, pianificazione e organizzazione del testo; coesione e coerenza testuale.",
    weight: 20,
  },
  {
    name: "Lessico e correttezza formale",
    description:
      "Ricchezza e padronanza lessicale; correttezza grammaticale (ortografia, morfologia, sintassi); uso corretto ed efficace della punteggiatura.",
    weight: 20,
  },
  {
    name: "Conoscenze e giudizio critico",
    description:
      "Ampiezza e precisione delle conoscenze e dei riferimenti culturali; espressione di giudizi critici e valutazioni personali.",
    weight: 20,
  },
];

/**
 * La griglia di partenza per ciascuna tipologia: indicatori generali piu'
 * quelli specifici (40 punti). Il quadro ministeriale fissa gli indicatori e
 * i due totali; la ripartizione dei punti tra i singoli indicatori spetta
 * alla commissione, quindi qui e' una proposta che il docente puo' cambiare.
 */
export const PRIMA_PROVA_RUBRICS: Record<string, RubricCriterion[]> = {
  prima_prova_a: [
    ...GENERALI,
    { name: "Rispetto dei vincoli della consegna", description: "Rispetto dei vincoli posti nella consegna (lunghezza, forma della risposta, indicazioni di lavoro).", weight: 10 },
    { name: "Comprensione del testo", description: "Capacità di comprendere il testo nel suo senso complessivo e nei suoi snodi tematici e stilistici.", weight: 10 },
    { name: "Analisi del testo", description: "Puntualità nell'analisi lessicale, sintattica, stilistica e retorica, se richiesta.", weight: 10 },
    { name: "Interpretazione", description: "Interpretazione corretta e articolata del testo.", weight: 10 },
  ],
  prima_prova_b: [
    ...GENERALI,
    { name: "Tesi e argomentazioni del testo proposto", description: "Individuazione corretta di tesi e argomentazioni presenti nel testo proposto.", weight: 15 },
    { name: "Percorso ragionativo", description: "Capacità di sostenere con coerenza un percorso ragionativo adoperando connettivi pertinenti.", weight: 15 },
    { name: "Riferimenti culturali a sostegno", description: "Correttezza e congruenza dei riferimenti culturali utilizzati per sostenere l'argomentazione.", weight: 10 },
  ],
  prima_prova_c: [
    ...GENERALI,
    { name: "Pertinenza rispetto alla traccia", description: "Pertinenza del testo rispetto alla traccia e coerenza nella formulazione del titolo e dell'eventuale paragrafazione.", weight: 15 },
    { name: "Sviluppo dell'esposizione", description: "Sviluppo ordinato e lineare dell'esposizione.", weight: 15 },
    { name: "Conoscenze e riferimenti culturali", description: "Correttezza e articolazione delle conoscenze e dei riferimenti culturali.", weight: 10 },
  ],
};

/** Il voto in decimi riportato sulla scala in ventesimi dell'esame. */
export function toTwentieths(gradeOutOfTen: number): number {
  return Math.round(gradeOutOfTen * 2);
}
