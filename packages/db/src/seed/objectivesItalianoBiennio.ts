import type { SeedObjective, SeedObjectiveGroup } from "./objectivesMatematicaBiennio";

/**
 * Catalogo base: Lingua e letteratura italiana, primo biennio.
 *
 * Organizzato per ambiti (riflessione sulla lingua, comprensione, scrittura,
 * parlato, educazione letteraria) secondo le Indicazioni nazionali e le Linee
 * guida. Proposta di partenza: nasce "bozza_da_rivedere".
 */
const PRIMA: SeedObjective[] = [
  {
    code: "ITA1.LIN.01",
    title: "Ortografia e punteggiatura",
    description:
      "Scrive rispettando le regole ortografiche e usa i segni di punteggiatura per rendere chiari i rapporti tra le parti della frase.",
  },
  {
    code: "ITA1.LIN.02",
    title: "Morfologia: le parti del discorso",
    description:
      "Riconosce e analizza le parti variabili e invariabili del discorso, con particolare attenzione a modi e tempi del verbo.",
  },
  {
    code: "ITA1.LIN.03",
    title: "Sintassi della frase semplice",
    description:
      "Individua soggetto, predicato e complementi e svolge l'analisi logica di frasi semplici.",
    requires: ["ITA1.LIN.02"],
  },
  {
    code: "ITA1.LIN.04",
    title: "Lessico: significato, formazione e registro delle parole",
    description:
      "Ricava il significato delle parole dal contesto e dalla loro formazione, usa il dizionario e sceglie il lessico adatto al registro.",
  },
  {
    code: "ITA1.COM.01",
    title: "Comprendere un testo: informazioni esplicite e implicite",
    description:
      "Individua tema, informazioni principali e secondarie di un testo e ricava per inferenza ciò che non è detto apertamente.",
  },
  {
    code: "ITA1.COM.02",
    title: "Riassumere un testo",
    description:
      "Seleziona le informazioni essenziali di un testo e le riformula in un riassunto coerente, proporzionato e con parole proprie.",
    requires: ["ITA1.COM.01"],
  },
  {
    code: "ITA1.SCR.01",
    title: "Pianificare e scrivere un testo coerente e coeso",
    description:
      "Progetta un testo con una scaletta, lo sviluppa in paragrafi collegati da connettivi e lo rivede prima della consegna.",
    requires: ["ITA1.LIN.01"],
  },
  {
    code: "ITA1.SCR.02",
    title: "Testo descrittivo e testo espositivo",
    description:
      "Scrive testi descrittivi ed espositivi organizzando le informazioni secondo un ordine riconoscibile e uno scopo.",
    requires: ["ITA1.SCR.01"],
  },
  {
    code: "ITA1.PAR.01",
    title: "Esporre oralmente in modo ordinato",
    description:
      "Espone un argomento di studio o un'esperienza con ordine, chiarezza e lessico appropriato, adeguandosi a chi ascolta.",
  },
  {
    code: "ITA1.LET.01",
    title: "Analizzare il testo narrativo",
    description:
      "Riconosce fabula e intreccio, sequenze, sistema dei personaggi, narratore, punto di vista, spazio e tempo di un racconto.",
    requires: ["ITA1.COM.01"],
  },
  {
    code: "ITA1.LET.02",
    title: "Epica classica e mito",
    description:
      "Legge e contestualizza passi dell'epica antica (Iliade, Odissea, Eneide) riconoscendone temi, personaggi e caratteri formali.",
    requires: ["ITA1.LET.01"],
  },
];

const SECONDA: SeedObjective[] = [
  {
    code: "ITA2.LIN.01",
    title: "Sintassi del periodo",
    description:
      "Distingue coordinazione e subordinazione, riconosce i principali tipi di proposizione e svolge l'analisi del periodo.",
    requires: ["ITA1.LIN.03"],
  },
  {
    code: "ITA2.LIN.02",
    title: "Uso di modi e tempi verbali nel periodo",
    description:
      "Usa correttamente indicativo, congiuntivo e condizionale nelle subordinate, rispettando la concordanza dei tempi.",
    requires: ["ITA1.LIN.02", "ITA2.LIN.01"],
  },
  {
    code: "ITA2.LIN.03",
    title: "Varietà e storia della lingua italiana",
    description:
      "Riconosce registri, linguaggi settoriali e varietà geografiche dell'italiano e le tappe essenziali della sua formazione dal latino.",
    requires: ["ITA1.LIN.04"],
  },
  {
    code: "ITA2.COM.01",
    title: "Comprendere testi argomentativi",
    description:
      "Individua in un testo tesi, argomenti, antitesi e confutazione e ne valuta la tenuta logica.",
    requires: ["ITA1.COM.01"],
  },
  {
    code: "ITA2.SCR.01",
    title: "Scrivere un testo argomentativo",
    description:
      "Sostiene una tesi con argomenti pertinenti ed esempi, considera un'obiezione e conclude in modo coerente.",
    requires: ["ITA1.SCR.01", "ITA2.COM.01"],
  },
  {
    code: "ITA2.SCR.02",
    title: "Scrivere l'analisi e il commento di un testo",
    description:
      "Produce l'analisi scritta di un testo letterario unendo comprensione, osservazioni sulla forma e interpretazione motivata.",
    requires: ["ITA1.LET.01", "ITA1.SCR.01"],
  },
  {
    code: "ITA2.PAR.01",
    title: "Discutere e argomentare oralmente",
    description:
      "Interviene in una discussione rispettando i turni, sostiene la propria posizione con argomenti e tiene conto di quelle altrui.",
    requires: ["ITA1.PAR.01"],
  },
  {
    code: "ITA2.LET.01",
    title: "Analizzare il testo poetico",
    description:
      "Riconosce verso, rima, strofa e principali figure retoriche di una poesia e ne svolge parafrasi e interpretazione.",
    requires: ["ITA1.COM.01"],
  },
  {
    code: "ITA2.LET.02",
    title: "I Promessi Sposi",
    description:
      "Legge il romanzo di Manzoni riconoscendone trama, personaggi, temi, scelte narrative e contesto storico.",
    requires: ["ITA1.LET.01"],
  },
  {
    code: "ITA2.LET.03",
    title: "Il testo teatrale",
    description:
      "Riconosce gli elementi specifici del testo teatrale (battute, didascalie, atti e scene) e i caratteri di tragedia e commedia.",
    requires: ["ITA1.LET.01"],
  },
  {
    code: "ITA2.LET.04",
    title: "Le origini della letteratura italiana",
    description:
      "Colloca nel loro contesto i primi testi in volgare, la poesia religiosa, la scuola siciliana e i poeti toscani prima dello Stilnovo.",
    requires: ["ITA2.LET.01", "ITA2.LIN.03"],
  },
];

export const OBJECTIVES_ITALIANO_BIENNIO: SeedObjectiveGroup[] = [
  { subject: "Italiano", gradeLevel: "1ª Superiore", objectives: PRIMA },
  { subject: "Italiano", gradeLevel: "2ª Superiore", objectives: SECONDA },
];
