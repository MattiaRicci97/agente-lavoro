/**
 * Catalogo base degli obiettivi di apprendimento: Matematica, primo biennio
 * della secondaria di secondo grado.
 *
 * Costruito a partire dai nuclei delle Indicazioni nazionali per i licei e
 * delle Linee guida per tecnici e professionali (Aritmetica e algebra,
 * Geometria, Relazioni e funzioni, Dati e previsioni). NON e' un programma
 * ufficiale: e' una proposta di partenza che ogni dipartimento rilegge,
 * adatta e conferma. Per questo nasce con review_status "bozza_da_rivedere".
 *
 * Il codice e' stabile e serve da chiave: titolo e descrizione si possono
 * aggiornare, il codice no.
 */
export interface SeedObjective {
  code: string;
  title: string;
  description: string;
  /** Codici degli obiettivi propedeutici (nello stesso catalogo). */
  requires?: string[];
}

export interface SeedObjectiveGroup {
  subject: string;
  gradeLevel: string;
  objectives: SeedObjective[];
}

const PRIMA: SeedObjective[] = [
  // Aritmetica e algebra
  {
    code: "MAT1.ARI.01",
    title: "Operare con numeri naturali e interi",
    description:
      "Esegue le quattro operazioni e le potenze in N e Z rispettando l'ordine delle operazioni e usando le proprieta' per semplificare i calcoli.",
  },
  {
    code: "MAT1.ARI.02",
    title: "Operare con frazioni e numeri razionali",
    description:
      "Confronta, ordina e opera con frazioni e numeri decimali; passa da una rappresentazione all'altra e riconosce frazioni equivalenti.",
    requires: ["MAT1.ARI.01"],
  },
  {
    code: "MAT1.ARI.03",
    title: "Potenze con esponente intero e notazione scientifica",
    description:
      "Applica le proprieta' delle potenze, anche con esponente negativo, e scrive numeri molto grandi o molto piccoli in notazione scientifica.",
    requires: ["MAT1.ARI.01"],
  },
  {
    code: "MAT1.ARI.04",
    title: "Divisibilita', MCD e mcm",
    description:
      "Scompone un numero in fattori primi e calcola massimo comune divisore e minimo comune multiplo, usandoli nelle frazioni e nei problemi.",
    requires: ["MAT1.ARI.01"],
  },
  {
    code: "MAT1.ARI.05",
    title: "Rapporti, proporzioni e percentuali",
    description:
      "Imposta e risolve proporzioni; calcola percentuali, sconti, aumenti e variazioni percentuali in contesti reali.",
    requires: ["MAT1.ARI.02"],
  },
  {
    code: "MAT1.ARI.06",
    title: "Introduzione ai numeri reali e alle radici quadrate",
    description:
      "Riconosce numeri irrazionali, stima e approssima radici quadrate, colloca i numeri sulla retta reale.",
    requires: ["MAT1.ARI.02"],
  },
  {
    code: "MAT1.ALG.01",
    title: "Espressioni letterali e monomi",
    description:
      "Traduce un testo in espressione letterale, calcola il valore numerico di un'espressione e opera con i monomi.",
    requires: ["MAT1.ARI.01", "MAT1.ARI.03"],
  },
  {
    code: "MAT1.ALG.02",
    title: "Polinomi e prodotti notevoli",
    description:
      "Somma, sottrae e moltiplica polinomi; riconosce e applica quadrato di binomio, differenza di quadrati e cubo di binomio.",
    requires: ["MAT1.ALG.01"],
  },
  {
    code: "MAT1.ALG.03",
    title: "Scomposizione di polinomi in fattori",
    description:
      "Scompone un polinomio con raccoglimento totale e parziale, prodotti notevoli e trinomio speciale, scegliendo la tecnica adatta.",
    requires: ["MAT1.ALG.02"],
  },
  {
    code: "MAT1.ALG.04",
    title: "Frazioni algebriche",
    description:
      "Determina le condizioni di esistenza di una frazione algebrica, la semplifica e opera con frazioni algebriche.",
    requires: ["MAT1.ALG.03"],
  },
  {
    code: "MAT1.ALG.05",
    title: "Equazioni di primo grado",
    description:
      "Risolve equazioni di primo grado intere applicando i principi di equivalenza, verifica la soluzione e riconosce equazioni impossibili o indeterminate.",
    requires: ["MAT1.ALG.01"],
  },
  {
    code: "MAT1.ALG.06",
    title: "Problemi con equazioni di primo grado",
    description:
      "Traduce un problema in un'equazione di primo grado, la risolve e controlla che la soluzione abbia senso nel contesto.",
    requires: ["MAT1.ALG.05"],
  },
  {
    code: "MAT1.ALG.07",
    title: "Disequazioni di primo grado",
    description:
      "Risolve disequazioni di primo grado e rappresenta l'insieme delle soluzioni sulla retta e con gli intervalli.",
    requires: ["MAT1.ALG.05"],
  },
  // Geometria
  {
    code: "MAT1.GEO.01",
    title: "Enti fondamentali, segmenti e angoli",
    description:
      "Distingue definizioni, assiomi e teoremi; opera con segmenti e angoli (confronto, somma, bisettrice, angoli complementari e supplementari).",
  },
  {
    code: "MAT1.GEO.02",
    title: "Triangoli e criteri di congruenza",
    description:
      "Classifica i triangoli, applica i criteri di congruenza e le proprieta' del triangolo isoscele in semplici dimostrazioni.",
    requires: ["MAT1.GEO.01"],
  },
  {
    code: "MAT1.GEO.03",
    title: "Rette perpendicolari e parallele",
    description:
      "Riconosce gli angoli formati da due rette parallele tagliate da una trasversale e li usa per calcolare angoli e dimostrare proprieta'.",
    requires: ["MAT1.GEO.01"],
  },
  {
    code: "MAT1.GEO.04",
    title: "Quadrilateri notevoli",
    description:
      "Conosce le proprieta' di parallelogrammi, rettangoli, rombi, quadrati e trapezi e le applica in problemi e dimostrazioni.",
    requires: ["MAT1.GEO.02", "MAT1.GEO.03"],
  },
  {
    code: "MAT1.GEO.05",
    title: "Costruire una dimostrazione geometrica",
    description:
      "Individua ipotesi e tesi, organizza una catena di passaggi giustificati e scrive una semplice dimostrazione.",
    requires: ["MAT1.GEO.02"],
  },
  // Relazioni e funzioni
  {
    code: "MAT1.REL.01",
    title: "Insiemi e loro operazioni",
    description:
      "Rappresenta insiemi per elencazione, caratteristica e con diagrammi di Eulero-Venn; esegue unione, intersezione, differenza e complementare.",
  },
  {
    code: "MAT1.REL.02",
    title: "Elementi di logica",
    description:
      "Usa connettivi e quantificatori, distingue un'implicazione dalla sua inversa e riconosce un controesempio.",
    requires: ["MAT1.REL.01"],
  },
  {
    code: "MAT1.REL.03",
    title: "Relazioni e funzioni nel piano cartesiano",
    description:
      "Riconosce una funzione, ne individua dominio e immagine e la rappresenta con tabelle, formule e grafici nel piano cartesiano.",
    requires: ["MAT1.REL.01"],
  },
  {
    code: "MAT1.REL.04",
    title: "Proporzionalita' e funzione lineare",
    description:
      "Riconosce proporzionalita' diretta e inversa, traccia e interpreta il grafico di una funzione lineare e ne legge pendenza e intercetta.",
    requires: ["MAT1.REL.03", "MAT1.ALG.05"],
  },
  // Dati e previsioni
  {
    code: "MAT1.DAT.01",
    title: "Raccogliere e rappresentare dati",
    description:
      "Organizza dati in tabelle di frequenze assolute e relative e li rappresenta con istogrammi, aerogrammi e diagrammi cartesiani.",
    requires: ["MAT1.ARI.05"],
  },
  {
    code: "MAT1.DAT.02",
    title: "Indici di posizione",
    description: "Calcola e interpreta media aritmetica, mediana e moda di una distribuzione di dati.",
    requires: ["MAT1.DAT.01"],
  },
];

const SECONDA: SeedObjective[] = [
  // Algebra
  {
    code: "MAT2.ALG.01",
    title: "Sistemi lineari",
    description:
      "Risolve sistemi di due equazioni di primo grado in due incognite con sostituzione, riduzione e confronto; li interpreta graficamente.",
    requires: ["MAT1.ALG.05"],
  },
  {
    code: "MAT2.ALG.02",
    title: "Problemi con sistemi lineari",
    description: "Traduce un problema in un sistema lineare, lo risolve e discute la soluzione nel contesto.",
    requires: ["MAT2.ALG.01"],
  },
  {
    code: "MAT2.ALG.03",
    title: "Radicali",
    description:
      "Applica le proprieta' dei radicali, porta fuori e dentro dal segno di radice, somma radicali simili e razionalizza denominatori.",
    requires: ["MAT1.ARI.06"],
  },
  {
    code: "MAT2.ALG.04",
    title: "Equazioni di secondo grado",
    description:
      "Risolve equazioni di secondo grado complete e incomplete, usa il discriminante per prevedere il numero di soluzioni.",
    requires: ["MAT1.ALG.03", "MAT2.ALG.03"],
  },
  {
    code: "MAT2.ALG.05",
    title: "Trinomio di secondo grado e relazioni tra radici e coefficienti",
    description:
      "Scompone un trinomio di secondo grado tramite le radici e usa somma e prodotto delle radici per risolvere problemi.",
    requires: ["MAT2.ALG.04"],
  },
  {
    code: "MAT2.ALG.06",
    title: "Problemi di secondo grado",
    description:
      "Imposta e risolve problemi, anche geometrici, che conducono a un'equazione di secondo grado, scartando le soluzioni non accettabili.",
    requires: ["MAT2.ALG.04"],
  },
  {
    code: "MAT2.ALG.07",
    title: "Disequazioni di secondo grado e sistemi di disequazioni",
    description:
      "Risolve disequazioni di secondo grado con lo studio del segno o la parabola e sistemi di disequazioni, rappresentando le soluzioni.",
    requires: ["MAT2.ALG.04", "MAT1.ALG.07"],
  },
  {
    code: "MAT2.ALG.08",
    title: "Equazioni e disequazioni fratte",
    description:
      "Risolve equazioni e disequazioni fratte imponendo le condizioni di esistenza e studiando il segno di numeratore e denominatore.",
    requires: ["MAT1.ALG.04", "MAT2.ALG.07"],
  },
  // Geometria
  {
    code: "MAT2.GEO.01",
    title: "Punti e segmenti nel piano cartesiano",
    description: "Calcola la distanza tra due punti e le coordinate del punto medio di un segmento.",
    requires: ["MAT1.REL.03"],
  },
  {
    code: "MAT2.GEO.02",
    title: "La retta nel piano cartesiano",
    description:
      "Scrive l'equazione di una retta, ne interpreta coefficiente angolare e termine noto, riconosce rette parallele e perpendicolari.",
    requires: ["MAT2.GEO.01", "MAT1.REL.04"],
  },
  {
    code: "MAT2.GEO.03",
    title: "Circonferenza e cerchio",
    description:
      "Conosce le proprieta' di corde, archi, angoli al centro e alla circonferenza e le posizioni reciproche tra rette e circonferenze.",
    requires: ["MAT1.GEO.02"],
  },
  {
    code: "MAT2.GEO.04",
    title: "Equivalenza, aree e teorema di Pitagora",
    description:
      "Calcola aree di poligoni tramite equivalenze e applica il teorema di Pitagora e le sue conseguenze nei triangoli notevoli.",
    requires: ["MAT1.GEO.04"],
  },
  {
    code: "MAT2.GEO.05",
    title: "Similitudine e teoremi di Euclide",
    description:
      "Riconosce triangoli simili con i criteri di similitudine e applica i teoremi di Euclide e di Talete in problemi.",
    requires: ["MAT2.GEO.04"],
  },
  {
    code: "MAT2.GEO.06",
    title: "Trasformazioni geometriche",
    description: "Riconosce e applica isometrie (traslazioni, rotazioni, simmetrie) e omotetie a semplici figure.",
    requires: ["MAT1.GEO.01"],
  },
  // Relazioni e funzioni
  {
    code: "MAT2.REL.01",
    title: "La parabola come grafico di una funzione di secondo grado",
    description:
      "Traccia il grafico di y = ax^2 + bx + c individuando vertice, asse e intersezioni con gli assi e lo collega alle equazioni di secondo grado.",
    requires: ["MAT2.ALG.04", "MAT2.GEO.01"],
  },
  {
    code: "MAT2.REL.02",
    title: "Leggere e interpretare grafici",
    description:
      "Ricava informazioni da grafici di funzioni in contesti reali (crescita, decrescita, massimi, zeri) e li collega a formule e tabelle.",
    requires: ["MAT1.REL.03"],
  },
  // Dati e previsioni
  {
    code: "MAT2.DAT.01",
    title: "Indici di variabilita'",
    description:
      "Calcola campo di variazione e scarto quadratico medio e li usa per confrontare la dispersione di due distribuzioni.",
    requires: ["MAT1.DAT.02"],
  },
  {
    code: "MAT2.DAT.02",
    title: "Probabilita' di eventi semplici e composti",
    description:
      "Calcola la probabilita' classica di un evento, di eventi incompatibili e indipendenti, e la confronta con la frequenza relativa.",
    requires: ["MAT1.ARI.02"],
  },
  {
    code: "MAT2.DAT.03",
    title: "Strumenti digitali per dati e grafici",
    description:
      "Usa un foglio elettronico o uno strumento digitale per organizzare dati, calcolare indici e produrre grafici.",
    requires: ["MAT1.DAT.01"],
  },
];

export const OBJECTIVES_MATEMATICA_BIENNIO: SeedObjectiveGroup[] = [
  { subject: "Matematica", gradeLevel: "1ª Superiore", objectives: PRIMA },
  { subject: "Matematica", gradeLevel: "2ª Superiore", objectives: SECONDA },
];
