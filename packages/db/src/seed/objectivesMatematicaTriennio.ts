import type { SeedObjective, SeedObjectiveGroup } from "./objectivesMatematicaBiennio";

/**
 * Catalogo base: Matematica, secondo biennio e quinto anno.
 *
 * Segue i nuclei delle Indicazioni nazionali (Aritmetica e algebra, Geometria,
 * Relazioni e funzioni, Dati e previsioni) con un taglio comune a licei e
 * tecnici. Come il resto del catalogo e' una proposta di partenza: nasce
 * "bozza_da_rivedere" e ogni dipartimento la adatta al proprio indirizzo.
 */
const TERZA: SeedObjective[] = [
  {
    code: "MAT3.ALG.01",
    title: "Equazioni e disequazioni di grado superiore al secondo",
    description:
      "Risolve equazioni e disequazioni polinomiali scomponendo in fattori e studiando il segno del prodotto.",
    requires: ["MAT2.ALG.07"],
  },
  {
    code: "MAT3.ALG.02",
    title: "Equazioni e disequazioni irrazionali e con valore assoluto",
    description:
      "Risolve equazioni e disequazioni con radicali o moduli, impostando le condizioni di esistenza e verificando le soluzioni.",
    requires: ["MAT2.ALG.03", "MAT2.ALG.07"],
  },
  {
    code: "MAT3.GEO.01",
    title: "Retta: fasci, distanze e luoghi geometrici",
    description:
      "Usa l'equazione della retta per risolvere problemi su parallelismo, perpendicolarità, distanza punto-retta e fasci di rette.",
    requires: ["MAT2.GEO.02"],
  },
  {
    code: "MAT3.GEO.02",
    title: "Parabola nel piano cartesiano",
    description:
      "Determina l'equazione di una parabola da condizioni assegnate, ne individua fuoco, direttrice e vertice e studia le posizioni rispetto a una retta.",
    requires: ["MAT2.REL.01", "MAT3.GEO.01"],
  },
  {
    code: "MAT3.GEO.03",
    title: "Circonferenza nel piano cartesiano",
    description:
      "Scrive l'equazione di una circonferenza, ne ricava centro e raggio e determina rette tangenti e secanti.",
    requires: ["MAT2.GEO.03", "MAT3.GEO.01"],
  },
  {
    code: "MAT3.GEO.04",
    title: "Ellisse e iperbole",
    description:
      "Riconosce ellisse e iperbole dalle loro equazioni canoniche, ne individua fuochi, assi e asintoti e le rappresenta.",
    requires: ["MAT3.GEO.03"],
  },
  {
    code: "MAT3.REL.01",
    title: "Funzioni: dominio, proprietà e trasformazioni del grafico",
    description:
      "Determina il dominio di una funzione, ne riconosce iniettività, parità e monotonia e ottiene nuovi grafici per traslazione, simmetria e dilatazione.",
    requires: ["MAT2.REL.02"],
  },
  {
    code: "MAT3.REL.02",
    title: "Successioni e progressioni",
    description:
      "Riconosce progressioni aritmetiche e geometriche, ne calcola termine generale e somma e le usa per modellizzare situazioni.",
    requires: ["MAT1.REL.03"],
  },
  {
    code: "MAT3.REL.03",
    title: "Funzione esponenziale ed equazioni esponenziali",
    description:
      "Traccia il grafico della funzione esponenziale, ne descrive la crescita e risolve equazioni e disequazioni esponenziali.",
    requires: ["MAT1.ARI.03", "MAT3.REL.01"],
  },
  {
    code: "MAT3.REL.04",
    title: "Logaritmi ed equazioni logaritmiche",
    description:
      "Applica la definizione e le proprietà dei logaritmi e risolve equazioni e disequazioni logaritmiche con le condizioni di esistenza.",
    requires: ["MAT3.REL.03"],
  },
  {
    code: "MAT3.DAT.01",
    title: "Statistica bivariata: correlazione e regressione",
    description:
      "Rappresenta due caratteri in un diagramma a dispersione, interpreta la correlazione e usa la retta di regressione per stime.",
    requires: ["MAT2.DAT.01", "MAT2.GEO.02"],
  },
];

const QUARTA: SeedObjective[] = [
  {
    code: "MAT4.GON.01",
    title: "Angoli, radianti e funzioni goniometriche",
    description:
      "Misura gli angoli in gradi e radianti, definisce seno, coseno e tangente sulla circonferenza goniometrica e ne traccia i grafici.",
    requires: ["MAT3.REL.01", "MAT2.GEO.03"],
  },
  {
    code: "MAT4.GON.02",
    title: "Formule goniometriche",
    description:
      "Usa archi associati e formule di addizione, duplicazione e bisezione per trasformare e semplificare espressioni.",
    requires: ["MAT4.GON.01"],
  },
  {
    code: "MAT4.GON.03",
    title: "Equazioni e disequazioni goniometriche",
    description:
      "Risolve equazioni e disequazioni goniometriche elementari, lineari e riconducibili a esse, rappresentando le soluzioni sulla circonferenza.",
    requires: ["MAT4.GON.02"],
  },
  {
    code: "MAT4.GON.04",
    title: "Trigonometria: risolvere i triangoli",
    description:
      "Applica i teoremi sui triangoli rettangoli, il teorema dei seni e quello del coseno a problemi geometrici e di misura.",
    requires: ["MAT4.GON.01", "MAT2.GEO.05"],
  },
  {
    code: "MAT4.ALG.01",
    title: "Numeri complessi",
    description:
      "Opera con i numeri complessi in forma algebrica e trigonometrica e li rappresenta nel piano di Gauss.",
    requires: ["MAT2.ALG.04", "MAT4.GON.01"],
  },
  {
    code: "MAT4.GEO.01",
    title: "Geometria solida: posizioni, superfici e volumi",
    description:
      "Riconosce le posizioni reciproche di rette e piani nello spazio e calcola aree e volumi di poliedri e solidi di rotazione.",
    requires: ["MAT2.GEO.04"],
  },
  {
    code: "MAT4.GEO.02",
    title: "Vettori nel piano e nello spazio",
    description:
      "Opera con i vettori in componenti, calcola prodotto scalare e modulo e li usa per esprimere perpendicolarità e parallelismo.",
    requires: ["MAT2.GEO.01"],
  },
  {
    code: "MAT4.DAT.01",
    title: "Calcolo combinatorio",
    description:
      "Conta disposizioni, permutazioni e combinazioni, con e senza ripetizione, scegliendo il modello adatto al problema.",
    requires: ["MAT2.DAT.02"],
  },
  {
    code: "MAT4.DAT.02",
    title: "Probabilità condizionata e teorema di Bayes",
    description:
      "Calcola probabilità composte e condizionate, riconosce eventi indipendenti e applica il teorema di Bayes a situazioni reali.",
    requires: ["MAT4.DAT.01"],
  },
  {
    code: "MAT4.REL.01",
    title: "Modelli di crescita e decadimento",
    description:
      "Costruisce e confronta modelli lineari, esponenziali e logaritmici per descrivere fenomeni e fare previsioni.",
    requires: ["MAT3.REL.04"],
  },
];

const QUINTA: SeedObjective[] = [
  {
    code: "MAT5.ANA.01",
    title: "Limiti di funzioni",
    description:
      "Interpreta il concetto di limite sul grafico, calcola limiti con l'algebra dei limiti e risolve le principali forme indeterminate.",
    requires: ["MAT3.REL.01", "MAT3.REL.04", "MAT4.GON.01"],
  },
  {
    code: "MAT5.ANA.02",
    title: "Continuità e asintoti",
    description:
      "Stabilisce se una funzione è continua, classifica i punti di discontinuità e determina asintoti verticali, orizzontali e obliqui.",
    requires: ["MAT5.ANA.01"],
  },
  {
    code: "MAT5.ANA.03",
    title: "Derivata: significato e regole di calcolo",
    description:
      "Interpreta la derivata come pendenza della tangente e velocità di variazione e calcola derivate con le regole di derivazione.",
    requires: ["MAT5.ANA.01"],
  },
  {
    code: "MAT5.ANA.04",
    title: "Teoremi del calcolo differenziale",
    description:
      "Enuncia e applica i teoremi di Rolle, Lagrange e De L'Hôpital, verificandone le ipotesi.",
    requires: ["MAT5.ANA.03", "MAT5.ANA.02"],
  },
  {
    code: "MAT5.ANA.05",
    title: "Massimi, minimi e flessi",
    description:
      "Studia crescenza e concavità con le derivate prima e seconda e individua punti stazionari e di flesso.",
    requires: ["MAT5.ANA.03"],
  },
  {
    code: "MAT5.ANA.06",
    title: "Studio completo di funzione",
    description:
      "Conduce lo studio di una funzione (dominio, segno, limiti, asintoti, derivate) e ne traccia il grafico probabile.",
    requires: ["MAT5.ANA.02", "MAT5.ANA.05"],
  },
  {
    code: "MAT5.ANA.07",
    title: "Problemi di ottimizzazione",
    description:
      "Traduce un problema di massimo o minimo in una funzione di una variabile e lo risolve con le derivate, discutendo l'accettabilità.",
    requires: ["MAT5.ANA.05"],
  },
  {
    code: "MAT5.ANA.08",
    title: "Integrali indefiniti",
    description:
      "Calcola primitive con gli integrali immediati e con i metodi di sostituzione e per parti.",
    requires: ["MAT5.ANA.03"],
  },
  {
    code: "MAT5.ANA.09",
    title: "Integrale definito, aree e volumi",
    description:
      "Applica il teorema fondamentale del calcolo integrale per determinare aree di regioni piane e volumi di solidi di rotazione.",
    requires: ["MAT5.ANA.08"],
  },
  {
    code: "MAT5.ANA.10",
    title: "Equazioni differenziali elementari",
    description:
      "Riconosce e risolve equazioni differenziali del primo ordine a variabili separabili e lineari, interpretandole come modelli.",
    requires: ["MAT5.ANA.08"],
  },
  {
    code: "MAT5.DAT.01",
    title: "Distribuzioni di probabilità",
    description:
      "Descrive variabili aleatorie discrete e continue con valore atteso e varianza e usa le distribuzioni binomiale e normale.",
    requires: ["MAT4.DAT.02"],
  },
];

export const OBJECTIVES_MATEMATICA_TRIENNIO: SeedObjectiveGroup[] = [
  { subject: "Matematica", gradeLevel: "3ª Superiore", objectives: TERZA },
  { subject: "Matematica", gradeLevel: "4ª Superiore", objectives: QUARTA },
  { subject: "Matematica", gradeLevel: "5ª Superiore", objectives: QUINTA },
];
