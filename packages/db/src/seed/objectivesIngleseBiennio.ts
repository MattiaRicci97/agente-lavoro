import type { SeedObjective, SeedObjectiveGroup } from "./objectivesMatematicaBiennio";

/**
 * Catalogo base: Lingua inglese, primo biennio.
 *
 * Organizzato per abilità (ascolto, lettura, parlato, scrittura) e strutture,
 * con il Quadro comune europeo come riferimento: verso l'A2 pieno in prima,
 * verso il B1 in seconda. Proposta di partenza: nasce "bozza_da_rivedere".
 */
const PRIMA: SeedObjective[] = [
  {
    code: "ING1.GRA.01",
    title: "Presente: present simple e present continuous",
    description:
      "Usa present simple e present continuous in frasi affermative, negative e interrogative per abitudini e azioni in corso.",
  },
  {
    code: "ING1.GRA.02",
    title: "Passato: past simple",
    description:
      "Racconta eventi conclusi con il past simple di verbi regolari e irregolari e con le espressioni di tempo adatte.",
    requires: ["ING1.GRA.01"],
  },
  {
    code: "ING1.GRA.03",
    title: "Nomi, quantificatori e comparativi",
    description:
      "Distingue nomi numerabili e non numerabili, usa some, any, much, many e forma comparativi e superlativi degli aggettivi.",
  },
  {
    code: "ING1.GRA.04",
    title: "Futuro: going to, will e present continuous",
    description:
      "Esprime intenzioni, previsioni e programmi scegliendo tra going to, will e present continuous.",
    requires: ["ING1.GRA.01"],
  },
  {
    code: "ING1.LES.01",
    title: "Lessico della vita quotidiana",
    description:
      "Usa il lessico di base su famiglia, scuola, casa, tempo libero, cibo e routine in contesti comunicativi.",
  },
  {
    code: "ING1.ASC.01",
    title: "Comprendere messaggi orali brevi e chiari",
    description:
      "Ricava l'informazione principale e i dettagli essenziali da dialoghi e annunci brevi su argomenti familiari (livello A2).",
    requires: ["ING1.LES.01"],
  },
  {
    code: "ING1.LET.01",
    title: "Comprendere testi scritti brevi",
    description:
      "Legge testi semplici (messaggi, descrizioni, brevi articoli) individuando informazioni specifiche e senso generale (livello A2).",
    requires: ["ING1.LES.01"],
  },
  {
    code: "ING1.PAR.01",
    title: "Interagire in situazioni quotidiane",
    description:
      "Si presenta, chiede e dà informazioni, descrive persone e luoghi in scambi semplici e diretti.",
    requires: ["ING1.GRA.01", "ING1.LES.01"],
  },
  {
    code: "ING1.SCR.01",
    title: "Scrivere brevi testi personali",
    description:
      "Scrive messaggi, email informali e brevi descrizioni collegando le frasi con connettivi semplici (and, but, because).",
    requires: ["ING1.GRA.01", "ING1.LES.01"],
  },
];

const SECONDA: SeedObjective[] = [
  {
    code: "ING2.GRA.01",
    title: "Past continuous e narrazione al passato",
    description:
      "Combina past simple e past continuous per raccontare azioni in corso e interrotte, con when e while.",
    requires: ["ING1.GRA.02"],
  },
  {
    code: "ING2.GRA.02",
    title: "Present perfect e confronto con il past simple",
    description:
      "Usa il present perfect con ever, never, just, already, yet, for e since e lo distingue dal past simple.",
    requires: ["ING1.GRA.02"],
  },
  {
    code: "ING2.GRA.03",
    title: "Verbi modali",
    description:
      "Esprime abilità, permesso, obbligo, divieto e consiglio con can, could, must, have to, should e may.",
    requires: ["ING1.GRA.01"],
  },
  {
    code: "ING2.GRA.04",
    title: "Periodo ipotetico di tipo zero, primo e secondo",
    description:
      "Formula ipotesi reali e immaginarie con if, scegliendo i tempi verbali corretti nelle due frasi.",
    requires: ["ING1.GRA.04", "ING2.GRA.03"],
  },
  {
    code: "ING2.GRA.05",
    title: "Forma passiva e frasi relative",
    description:
      "Usa il passivo al presente e al passato e collega le informazioni con le frasi relative introdotte da who, which, that, where.",
    requires: ["ING2.GRA.02"],
  },
  {
    code: "ING2.ASC.01",
    title: "Comprendere discorsi su argomenti noti",
    description:
      "Segue i punti principali di conversazioni, interviste e brevi registrazioni su temi familiari o di studio (verso il B1).",
    requires: ["ING1.ASC.01"],
  },
  {
    code: "ING2.LET.01",
    title: "Comprendere testi di media lunghezza",
    description:
      "Legge articoli, racconti semplici e testi informativi cogliendo idee principali, dettagli e opinione dell'autore (verso il B1).",
    requires: ["ING1.LET.01"],
  },
  {
    code: "ING2.PAR.01",
    title: "Raccontare esperienze ed esprimere opinioni",
    description:
      "Racconta fatti ed esperienze, esprime e motiva opinioni e preferenze, mantenendo la conversazione su argomenti noti.",
    requires: ["ING1.PAR.01", "ING2.GRA.02"],
  },
  {
    code: "ING2.SCR.01",
    title: "Scrivere testi articolati",
    description:
      "Scrive email, racconti brevi e testi di opinione organizzati in paragrafi, con connettivi di sequenza, contrasto e causa.",
    requires: ["ING1.SCR.01", "ING2.GRA.01"],
  },
  {
    code: "ING2.CUL.01",
    title: "Cultura dei paesi anglofoni",
    description:
      "Conosce aspetti di vita, geografia e società dei paesi di lingua inglese e li confronta con la propria realtà.",
    requires: ["ING1.LET.01"],
  },
];

export const OBJECTIVES_INGLESE_BIENNIO: SeedObjectiveGroup[] = [
  { subject: "Inglese", gradeLevel: "1ª Superiore", objectives: PRIMA },
  { subject: "Inglese", gradeLevel: "2ª Superiore", objectives: SECONDA },
];
