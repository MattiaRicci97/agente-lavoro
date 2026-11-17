import type { SeedObjective, SeedObjectiveGroup } from "./objectivesMatematicaBiennio";

/**
 * Catalogo base: Fisica, primo biennio.
 *
 * Segue il percorso tipico del biennio (misura, forze ed equilibrio, moto,
 * energia, calore, ottica). Dove la fisica comincia al terzo anno il
 * dipartimento puo' disattivare il catalogo o spostarlo. Proposta di
 * partenza: nasce "bozza_da_rivedere".
 */
const PRIMA: SeedObjective[] = [
  {
    code: "FIS1.MIS.01",
    title: "Grandezze fisiche e unità di misura",
    description:
      "Distingue grandezze fondamentali e derivate, usa il Sistema Internazionale, esegue equivalenze e scrive in notazione scientifica.",
  },
  {
    code: "FIS1.MIS.02",
    title: "Misura e incertezza",
    description:
      "Esprime il risultato di una misura con la sua incertezza, usa le cifre significative e distingue errori casuali e sistematici.",
    requires: ["FIS1.MIS.01"],
  },
  {
    code: "FIS1.MIS.03",
    title: "Relazioni tra grandezze e grafici",
    description:
      "Riconosce proporzionalità diretta, inversa e quadratica da tabelle e grafici sperimentali e ne ricava la legge.",
    requires: ["FIS1.MIS.01"],
  },
  {
    code: "FIS1.FOR.01",
    title: "Vettori e operazioni con i vettori",
    description:
      "Distingue grandezze scalari e vettoriali, somma e scompone vettori con metodo grafico e per componenti.",
    requires: ["FIS1.MIS.01"],
  },
  {
    code: "FIS1.FOR.02",
    title: "Forze: peso, forza elastica e attrito",
    description:
      "Descrive gli effetti delle forze, distingue massa e peso e applica la legge di Hooke e le leggi dell'attrito.",
    requires: ["FIS1.FOR.01", "FIS1.MIS.03"],
  },
  {
    code: "FIS1.EQU.01",
    title: "Equilibrio del punto materiale",
    description:
      "Disegna il diagramma delle forze e impone la condizione di equilibrio, anche su un piano inclinato.",
    requires: ["FIS1.FOR.02"],
  },
  {
    code: "FIS1.EQU.02",
    title: "Equilibrio del corpo rigido: momento e leve",
    description:
      "Calcola il momento di una forza, applica le condizioni di equilibrio di un corpo rigido e analizza leve e baricentro.",
    requires: ["FIS1.EQU.01"],
  },
  {
    code: "FIS1.FLU.01",
    title: "Pressione ed equilibrio dei fluidi",
    description:
      "Definisce la pressione e applica il principio di Pascal, la legge di Stevino e il principio di Archimede.",
    requires: ["FIS1.FOR.02"],
  },
];

const SECONDA: SeedObjective[] = [
  {
    code: "FIS2.MOT.01",
    title: "Moto rettilineo uniforme",
    description:
      "Descrive il moto con sistema di riferimento, posizione e velocità media, usa la legge oraria e legge i grafici spazio-tempo.",
    requires: ["FIS1.MIS.03"],
  },
  {
    code: "FIS2.MOT.02",
    title: "Moto uniformemente accelerato e caduta libera",
    description:
      "Definisce l'accelerazione, applica le leggi del moto uniformemente accelerato e interpreta i grafici velocità-tempo.",
    requires: ["FIS2.MOT.01"],
  },
  {
    code: "FIS2.MOT.03",
    title: "Moti nel piano: moto circolare uniforme e moto parabolico",
    description:
      "Descrive il moto circolare con periodo, frequenza e accelerazione centripeta e scompone il moto di un proiettile.",
    requires: ["FIS2.MOT.02", "FIS1.FOR.01"],
  },
  {
    code: "FIS2.DIN.01",
    title: "I tre principi della dinamica",
    description:
      "Enuncia i principi della dinamica e li applica per determinare forze e accelerazioni in situazioni semplici.",
    requires: ["FIS2.MOT.02", "FIS1.FOR.02"],
  },
  {
    code: "FIS2.DIN.02",
    title: "Applicazioni dei principi della dinamica",
    description:
      "Risolve problemi con piano inclinato, attrito, tensione di funi e forza centripeta impostando l'equazione del moto.",
    requires: ["FIS2.DIN.01", "FIS1.EQU.01"],
  },
  {
    code: "FIS2.ENE.01",
    title: "Lavoro, potenza ed energia cinetica",
    description:
      "Calcola il lavoro di una forza e la potenza e applica il teorema dell'energia cinetica.",
    requires: ["FIS2.DIN.01"],
  },
  {
    code: "FIS2.ENE.02",
    title: "Energia potenziale e conservazione dell'energia meccanica",
    description:
      "Usa energia potenziale gravitazionale ed elastica e applica la conservazione dell'energia, anche in presenza di attrito.",
    requires: ["FIS2.ENE.01"],
  },
  {
    code: "FIS2.TER.01",
    title: "Temperatura, calore e passaggi di stato",
    description:
      "Distingue temperatura e calore, applica la legge fondamentale della calorimetria e descrive dilatazione e passaggi di stato.",
    requires: ["FIS1.MIS.03"],
  },
  {
    code: "FIS2.OTT.01",
    title: "Ottica geometrica",
    description:
      "Applica le leggi della riflessione e della rifrazione e costruisce le immagini prodotte da specchi e lenti sottili.",
    requires: ["FIS1.MIS.03"],
  },
];

export const OBJECTIVES_FISICA_BIENNIO: SeedObjectiveGroup[] = [
  { subject: "Fisica", gradeLevel: "1ª Superiore", objectives: PRIMA },
  { subject: "Fisica", gradeLevel: "2ª Superiore", objectives: SECONDA },
];
