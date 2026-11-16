import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { logger } from "./logger";

// Client Anthropic creato solo al primo utilizzo: cosi' il server si avvia
// anche se la chiave non e' impostata, e sono solo le funzioni AI a fallire
// (con un errore chiaro) invece di far crashare l'intero server all'avvio.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY non impostata: le funzioni AI non sono disponibili");
    }
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{") === -1 ? raw.indexOf("[") : Math.min(...[raw.indexOf("{"), raw.indexOf("[")].filter((n) => n !== -1));
  const lastBrace = raw.lastIndexOf("}");
  const lastBracket = raw.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  const slice = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  try {
    return JSON.parse(slice.trim()) as T;
  } catch {
    // Tipicamente accade quando la risposta e' stata troncata dal limite di token.
    throw new Error("La risposta dell'AI e' incompleta o non in formato valido. Riprova.");
  }
}

export interface GeneratedQuestion {
  question: string;
  answer: string;
  topic: string;
  difficulty: "facile" | "medio" | "difficile";
  hints: string[];
}

export const MAX_HINTS = 3;
const MAX_HINT_LENGTH = 300;

/**
 * Ripulisce gli aiuti proposti dal modello (o scritti dal docente): solo
 * stringhe non vuote, al massimo tre, ciascuna breve. Qualsiasi altra cosa
 * viene scartata invece di far fallire la domanda intera.
 */
export function normalizeHints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.trim())
    .filter((h) => h.length > 0)
    .map((h) => (h.length > MAX_HINT_LENGTH ? `${h.slice(0, MAX_HINT_LENGTH - 1).trimEnd()}…` : h))
    .slice(0, MAX_HINTS);
}

/** Le istruzioni sugli aiuti, uguali ovunque il modello ne scriva. */
const HINTS_RULES =
  "Gli aiuti (hints) sono da 2 a 3 indizi progressivi per lo studente bloccato: il primo orienta soltanto (che cosa richiamare alla mente), " +
  "il secondo suggerisce il metodo o il passaggio da cui partire, l'eventuale terzo avvicina di piu' ma lascia l'ultimo passo allo studente. " +
  "Un aiuto non contiene MAI la risposta ne' il risultato finale.";

export async function generateActiveRecallQuestions(
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
): Promise<GeneratedQuestion[]> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 8192,
    system:
      "Sei un pedagogista esperto nella tecnica del richiamo attivo (active recall) per le scuole superiori italiane. " +
      "A partire dal materiale didattico fornito da un docente, generi domande a risposta aperta che costringono lo studente a recuperare attivamente il concetto dalla memoria, non a riconoscerlo. " +
      "Copri l'intero materiale, variando argomenti e difficolta'. Rispondi SOLO con JSON valido, nessun testo fuori dal JSON.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nLivello scolastico: ${gradeLevel}\nTitolo: ${materialTitle}\n\n` +
          `Contenuto della lezione:\n${content}\n\n` +
          `Genera tra 6 e 10 domande a richiamo attivo su questo materiale. Per ognuna indica anche l'argomento specifico (topic, breve, 2-4 parole) e una difficolta' tra "facile", "medio", "difficile". ` +
          `Per ognuna scrivi anche gli aiuti. ${HINTS_RULES} ` +
          `Rispondi con un array JSON del tipo: [{"question": "...", "answer": "...", "topic": "...", "difficulty": "facile|medio|difficile", "hints": ["...", "..."]}]`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  const parsed = extractJson<GeneratedQuestion[]>(textBlock.text).map((q) => ({ ...q, hints: normalizeHints(q.hints) }));
  logger.info({ count: parsed.length }, "Generated active recall questions");
  return parsed;
}

export interface GradedAnswerResult {
  correct: boolean;
  feedback: string;
}

export async function gradeQuizAnswer(
  question: string,
  correctAnswer: string,
  studentAnswer: string,
): Promise<GradedAnswerResult> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Sei un docente italiano che corregge le risposte aperte di uno studente in un quiz di richiamo attivo. " +
      "Valuta se la risposta dello studente coglie il concetto chiave, anche se formulata diversamente dalla risposta di riferimento. " +
      "Da' un feedback breve, costruttivo e in italiano (massimo 2 frasi). Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Domanda: ${question}\nRisposta di riferimento: ${correctAnswer}\nRisposta dello studente: ${studentAnswer}\n\n` +
          `Rispondi con JSON: {"correct": true|false, "feedback": "..."}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return extractJson<GradedAnswerResult>(textBlock.text);
}

export interface CurriculumTagResult {
  topic: string;
  subtopic: string;
  /** Codici degli obiettivi della mappa che il materiale copre (solo tra i candidati). */
  objectiveCodes: string[];
}

export interface ObjectiveCandidate {
  code: string;
  title: string;
}

/** Forma attesa della risposta del modello: qualsiasi scostamento viene scartato. */
export const CurriculumTagSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  subtopic: z.string().trim().max(200).default(""),
  objectiveCodes: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});

/**
 * Collega un materiale al programma: macro-argomento, sotto-argomento e, se
 * l'istituto ha una mappa degli obiettivi per quella materia, i codici degli
 * obiettivi coperti. L'elenco dei candidati e' chiuso: il modello non puo'
 * inventare un obiettivo, puo' solo scegliere tra quelli del dipartimento.
 */
export async function classifyCurriculumTopic(
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
  candidates: ObjectiveCandidate[] = [],
): Promise<CurriculumTagResult> {
  const candidateBlock = candidates.length
    ? `\n\nObiettivi di apprendimento disponibili per questa materia (scegli SOLO tra questi, al massimo 5, i codici di quelli che il materiale copre davvero; lista vuota se nessuno):\n` +
      candidates.map((c) => `- ${c.code}: ${c.title}`).join("\n")
    : "";

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 512,
    system:
      "Sei un esperto delle Indicazioni Nazionali e delle Linee Guida ministeriali italiane per le scuole superiori. " +
      "Dato un materiale didattico, individui a quale macro-argomento del programma ministeriale della materia appartiene e il sotto-argomento specifico. " +
      "Usa terminologia da programma scolastico italiano ufficiale (es. per Storia: 'Il Novecento' / 'La Seconda Guerra Mondiale'; per Matematica: 'Analisi Matematica' / 'Studio di funzione'). " +
      "Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nLivello scolastico: ${gradeLevel}\nTitolo materiale: ${materialTitle}\n\nContenuto:\n${content.slice(0, 4000)}${candidateBlock}\n\n` +
          `Rispondi con JSON: {"topic": "macro-argomento del programma", "subtopic": "sotto-argomento specifico", "objectiveCodes": ["codice", ...]}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return parseCurriculumTag(extractJson<unknown>(textBlock.text), candidates);
}

/** Valida la risposta e tiene solo i codici che esistono davvero tra i candidati. */
export function parseCurriculumTag(raw: unknown, candidates: ObjectiveCandidate[]): CurriculumTagResult {
  const parsed = CurriculumTagSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("La classificazione dell'AI non e' nel formato atteso.");
  }
  const allowed = new Set(candidates.map((c) => c.code));
  const objectiveCodes = Array.from(new Set(parsed.data.objectiveCodes.filter((c) => allowed.has(c)))).slice(0, 5);
  return { topic: parsed.data.topic, subtopic: parsed.data.subtopic, objectiveCodes };
}

export async function generateSimplifiedContent(
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
): Promise<string> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "Sei un insegnante di sostegno esperto in didattica inclusiva per studenti con BES/DSA (Bisogni Educativi Speciali/Disturbi Specifici dell'Apprendimento) nella scuola italiana. " +
      "Riscrivi il materiale didattico fornito applicando le buone pratiche per la dislessia e i BES: frasi brevi e dirette, lessico semplice, struttura a punti elenco, evidenziazione dei concetti chiave in **grassetto**, mappe concettuali testuali quando utile, eliminazione di subordinate complesse. " +
      "Non perdere i contenuti essenziali. Scrivi in italiano, in formato markdown semplice.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nLivello scolastico: ${gradeLevel}\nTitolo: ${materialTitle}\n\nContenuto originale:\n${content}\n\n` +
          `Riscrivi questo materiale in versione semplificata per uno studente con BES/DSA.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return textBlock.text.trim();
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  tema: "tema argomentativo/espositivo in italiano, come alla prima prova dell'esame di stato",
  versione: "versione di lingua classica (latino o greco) o straniera da tradurre",
  problema: "problema di matematica o fisica con piu' quesiti, come alla seconda prova",
  prima_prova_a:
    "simulazione della prima prova dell'esame di Stato, TIPOLOGIA A (analisi e interpretazione di un testo letterario italiano). " +
    "La traccia riporta il testo da analizzare (un brano o una poesia), una breve nota sull'autore, e poi le consegne divise in " +
    "\"Comprensione e analisi\" (4-5 domande numerate) e \"Interpretazione\"",
  prima_prova_b:
    "simulazione della prima prova dell'esame di Stato, TIPOLOGIA B (analisi e produzione di un testo argomentativo). " +
    "La traccia riporta un testo argomentativo di partenza (30-40 righe) e poi le consegne divise in " +
    "\"Comprensione e analisi\" (3-4 domande numerate) e \"Produzione\" (la richiesta di un testo argomentativo sul tema)",
  prima_prova_c:
    "simulazione della prima prova dell'esame di Stato, TIPOLOGIA C (riflessione critica di carattere espositivo-argomentativo su tematiche di attualita'). " +
    "La traccia riporta un breve testo di appoggio e la consegna, con l'invito a dare un titolo e, se si vuole, a dividere il testo in paragrafi",
};

const isPrimaProva = (examType: string) => examType.startsWith("prima_prova_");

export interface WrittenExamPromptResult {
  prompt: string;
}

export async function generateWrittenExamPrompt(
  examType: string,
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
): Promise<WrittenExamPromptResult> {
  const label = EXAM_TYPE_LABELS[examType] ?? examType;

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: isPrimaProva(examType) ? 3500 : 2048,
    system:
      "Sei un docente italiano che prepara verifiche scritte nel formato reale usato nelle scuole superiori italiane. " +
      `Il formato richiesto e': ${label}. ` +
      "Genera una traccia completa, pronta per essere consegnata a uno studente, coerente con il materiale fornito. Scrivi solo la traccia, in italiano, senza commenti aggiuntivi. Non usare JSON, scrivi testo semplice/markdown." +
      (isPrimaProva(examType)
        ? " Segui l'impianto delle tracce ministeriali. Il testo da analizzare o di appoggio deve venire dal materiale fornito, se ne contiene uno adatto; " +
          "altrimenti scegli un passo di un autore le cui opere sono di pubblico dominio e riportalo SOLO se sei certo delle parole esatte: " +
          "se non lo sei, scrivi un testo di appoggio originale e dichiaralo come tale, senza attribuirlo a nessun autore. Non inventare citazioni."
        : ""),
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nLivello scolastico: ${gradeLevel}\nMateriale di riferimento: ${materialTitle}\n\nContenuto:\n${content.slice(0, 6000)}\n\n` +
          `Genera la traccia della verifica scritta (${examType}).`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return { prompt: textBlock.text.trim() };
}

/**
 * Diagnosi per esercizio: oltre al voto, il modello dice su quale obiettivo
 * della mappa lo studente ha lavorato e come e' andata.
 *
 * L'elenco degli obiettivi e' chiuso: il modello sceglie tra i candidati
 * ricevuti o lascia null. Un codice inventato diventa "non classificato", non
 * un obiettivo nuovo. Quello che esce da qui e' una proposta: il docente la
 * conferma o la corregge insieme al voto.
 */
export const DIAGNOSIS_OUTCOMES = ["corretto", "parziale", "errato"] as const;
export const DIAGNOSIS_ERROR_TYPES = ["concettuale", "procedurale", "distrazione", "non_classificato"] as const;

export const DiagnosisItemSchema = z.object({
  exercise: z.string().trim().min(1).max(80),
  objectiveCode: z.string().trim().max(40).nullable().default(null),
  outcome: z.enum(DIAGNOSIS_OUTCOMES),
  errorType: z.enum(DIAGNOSIS_ERROR_TYPES).nullable().default(null),
  evidence: z.string().trim().max(400).default(""),
});
export const DiagnosisSchema = z.array(DiagnosisItemSchema).max(30);

export interface DiagnosedExercise {
  exercise: string;
  objectiveCode: string | null;
  outcome: (typeof DIAGNOSIS_OUTCOMES)[number];
  errorType: (typeof DIAGNOSIS_ERROR_TYPES)[number] | null;
  evidence: string;
}

/**
 * Valida la diagnosi proposta. Se la lista non e' nel formato atteso restituisce
 * una lista vuota: il voto resta valido, la diagnosi semplicemente manca (e il
 * chiamante lo registra). Le righe vengono normalizzate:
 *  - codice sconosciuto -> obiettivo null;
 *  - esercizio errato o parziale senza obiettivo -> "non_classificato";
 *  - esercizio corretto -> nessun tipo di errore.
 */
export function parseDiagnosis(raw: unknown, candidates: ObjectiveCandidate[]): DiagnosedExercise[] {
  const parsed = DiagnosisSchema.safeParse(raw);
  if (!parsed.success) return [];
  const allowed = new Set(candidates.map((c) => c.code));
  return parsed.data.map((row) => {
    const objectiveCode = row.objectiveCode && allowed.has(row.objectiveCode) ? row.objectiveCode : null;
    const wrong = row.outcome !== "corretto";
    let errorType = wrong ? row.errorType : null;
    if (wrong && (errorType === null || objectiveCode === null)) {
      errorType = errorType ?? "non_classificato";
    }
    return { exercise: row.exercise, objectiveCode, outcome: row.outcome, errorType, evidence: row.evidence };
  });
}

function diagnosisInstructions(candidates: ObjectiveCandidate[]): string {
  const list = candidates.length
    ? `Obiettivi di apprendimento disponibili (usa SOLO questi codici, oppure null se nessuno calza):\n` +
      candidates.map((c) => `- ${c.code}: ${c.title}`).join("\n")
    : "Nessun obiettivo disponibile: lascia objectiveCode a null.";
  return (
    `\n\nOltre al voto, prepara una diagnosi esercizio per esercizio (o passaggio per passaggio, se l'elaborato e' unico). ` +
    `Per ciascuno indica: "exercise" (etichetta breve, es. "Es. 2"), "objectiveCode" (dalla lista o null), ` +
    `"outcome" (corretto | parziale | errato), "errorType" (solo se non corretto: concettuale = non ha capito il concetto; ` +
    `procedurale = ha capito ma sbaglia il procedimento; distrazione = errore di calcolo o svista; altrimenti null), ` +
    `"evidence" (una frase breve presa dalla risposta dello studente che mostra l'errore o la riuscita, senza giudizi sulla persona).\n${list}`
  );
}

export interface WrittenExamGradeResult {
  grade: number;
  feedback: string;
  /** Punteggi per criterio, cosi' come li ha scritti il modello (da validare contro la griglia). */
  rubricScores: unknown;
  /** Vuota se il modello non ha prodotto una diagnosi valida. */
  diagnosis: DiagnosedExercise[];
}

export const WrittenExamGradeSchema = z.object({
  grade: z.number().min(1).max(10),
  feedback: z.string().trim().min(1).max(6000),
});

export async function gradeWrittenExam(
  examType: string,
  prompt: string,
  subject: string,
  studentAnswer: string,
  candidates: ObjectiveCandidate[] = [],
  rubric: Array<{ name: string; description: string; weight: number }> = [],
): Promise<WrittenExamGradeResult> {
  const label = EXAM_TYPE_LABELS[examType] ?? examType;
  const rubricBlock = rubric.length
    ? `\n\nGriglia di valutazione decisa dal docente (usa SOLO questi criteri, con questi nomi esatti):\n` +
      rubric.map((c) => `- ${c.name} (peso ${c.weight}%)${c.description ? `: ${c.description}` : ""}`).join("\n") +
      `\nPer ogni criterio dai un punteggio da 1 a 10 e una nota di una frase riferita all'elaborato. ` +
      `Il voto complessivo deve essere coerente con la media pesata dei criteri.`
    : "";

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 3072,
    system:
      "Sei un docente italiano che corregge verifiche scritte nel formato reale delle scuole superiori. " +
      `Il formato e': ${label}. ` +
      "Valuta l'elaborato dello studente con un voto in decimi (da 1 a 10, anche con mezzi punti arrotondati all'intero piu' vicino) e un feedback dettagliato e costruttivo in italiano, come farebbe un vero insegnante, indicando punti di forza e aspetti da migliorare. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nTraccia:\n${prompt}\n\nElaborato dello studente:\n${studentAnswer}` +
          rubricBlock +
          diagnosisInstructions(candidates) +
          `\n\nRispondi con JSON: {"grade": numero_da_1_a_10, "feedback": "...", ` +
          (rubric.length ? `"rubricScores": [{"criterion": "nome esatto del criterio", "score": numero_da_1_a_10, "note": "..."}], ` : "") +
          `"diagnosis": [{"exercise": "...", "objectiveCode": "..."|null, "outcome": "corretto|parziale|errato", "errorType": "concettuale|procedurale|distrazione"|null, "evidence": "..."}]}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  const raw = extractJson<Record<string, unknown>>(textBlock.text);
  const graded = WrittenExamGradeSchema.safeParse(raw);
  if (!graded.success) {
    throw new Error("La correzione dell'AI non e' nel formato atteso. Riprova.");
  }
  return { ...graded.data, rubricScores: raw.rubricScores, diagnosis: parseDiagnosis(raw.diagnosis, candidates) };
}

/**
 * Bozza di griglia di valutazione per una verifica: pochi criteri osservabili
 * con un peso. Al modello va solo la traccia. Il docente rilegge e approva.
 */
export async function generateRubric(input: {
  examType: string;
  subject: string;
  gradeLevel: string;
  prompt: string;
}): Promise<unknown> {
  const label = EXAM_TYPE_LABELS[input.examType] ?? input.examType;
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "Sei un docente italiano di scuola superiore che prepara la griglia di valutazione di una verifica scritta. " +
      `Il formato della verifica e': ${label}. ` +
      "Scegli da 3 a 5 criteri osservabili nell'elaborato (non giudizi sulla persona), ciascuno con un nome breve, " +
      "una descrizione di una frase su che cosa si guarda, e un peso in percentuale; i pesi sommano a 100. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel}\n\nTraccia:\n${input.prompt.slice(0, 4000)}\n\n` +
          `Rispondi con JSON: {"criteria": [{"name": "...", "description": "...", "weight": numero}]}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  return extractJson<{ criteria?: unknown }>(textBlock.text).criteria;
}

export interface OralTurnResult {
  reply: string;
  finished: boolean;
  grade: number | null;
  feedback: string | null;
}

export async function nextOralExamTurn(
  materialTitle: string,
  subject: string,
  content: string,
  transcript: Array<{ role: "examiner" | "student"; content: string }>,
): Promise<OralTurnResult> {
  const turnsSoFar = transcript.filter((m) => m.role === "examiner").length;
  const shouldWrapUp = turnsSoFar >= 4;

  const message = await getAnthropic().messages.create({
    model: MODEL,
    // Ampio margine: il turno finale include osservazione + voto + feedback
    // dettagliato, e una risposta troncata farebbe fallire il parsing.
    max_tokens: 2500,
    system:
      "Sei un professore italiano che sta facendo un'interrogazione orale a uno studente delle superiori, basata esclusivamente sul materiale fornito. " +
      "Fai una domanda alla volta, incalza con richieste di approfondimento o collegamenti quando la risposta e' vaga, e correggi con garbo ma fermezza gli errori. " +
      "Mantieni un tono autorevole ma umano, come un vero docente italiano. Scrivi sempre in italiano. " +
      `Questa interrogazione ha gia' avuto ${turnsSoFar} domande. ` +
      (shouldWrapUp
        ? "E' il momento di chiudere l'interrogazione: fai un'ultima osservazione conclusiva allo studente, poi assegna un voto da 1 a 10 e un feedback complessivo dettagliato."
        : "Continua l'interrogazione con la prossima domanda o un approfondimento.") +
      ' Rispondi SOLO con JSON valido nella forma: {"reply": "...", "finished": true|false, "grade": numero_o_null, "feedback": "stringa_o_null"}. Se finished e\' false, grade e feedback devono essere null.',
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nMateriale su cui verte l'interrogazione: ${materialTitle}\n\nContenuto:\n${content}\n\n` +
          `Trascrizione finora:\n${transcript.map((m) => `${m.role === "examiner" ? "Professore" : "Studente"}: ${m.content}`).join("\n")}\n\n` +
          (shouldWrapUp
            ? "Chiudi ora l'interrogazione con un voto e un feedback."
            : "Fai la prossima domanda o richiesta di approfondimento."),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return extractJson<OralTurnResult>(textBlock.text);
}

export async function askTeacherAssistant(
  classSnapshot: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
): Promise<string> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "Sei l'assistente didattico di Sillabo per un docente italiano. Rispondi in italiano, in modo concreto e sintetico, " +
      "basandoti ESCLUSIVAMENTE sui dati della classe forniti qui sotto. Cita nomi di studenti, materiali e argomenti reali quando rilevante. " +
      "Se i dati non bastano per rispondere, dillo chiaramente e suggerisci cosa far svolgere agli studenti per raccogliere il dato. " +
      "Concludi, quando ha senso, con un suggerimento didattico azionabile (es. cosa rispiegare nella prossima lezione).\n\n" +
      `DATI DELLE CLASSI DEL DOCENTE:\n${classSnapshot}`,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content }) as const),
      { role: "user" as const, content: question },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }
  return textBlock.text.trim();
}

export async function askStudyTutor(
  material: { title: string; subject: string; gradeLevel: string; content: string },
  besDsa: boolean,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
): Promise<string> {
  const inclusivo = besDsa
    ? "Lo studente ha dichiarato BES/DSA: usa frasi brevi e dirette, lessico semplice, un concetto alla volta, elenchi puntati e grassetto per le parole chiave. Evita subordinate complesse. "
    : "";

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system:
      "Sei il tutor di studio di Sillabo: un insegnante paziente e incoraggiante che aiuta uno studente italiano a capire il materiale su cui sta studiando. " +
      "Rispondi SEMPRE in italiano, con tono caldo e umano, adeguando il linguaggio al livello scolastico indicato. " +
      "Il tuo compito e' spiegare, chiarire i dubbi, fare esempi concreti e analogie: NON interrogare e non mettere alla prova. " +
      "Basati principalmente sul materiale fornito qui sotto. Se una domanda esce dal materiale, puoi aiutare comunque con spiegazioni generali corrette, ma segnala con garbo che va oltre la lezione caricata dal docente. " +
      "Non dare mai per pigrizia la 'soluzione del compito' bell'e pronta: guida lo studente a capire. Sii conciso ma chiaro. " +
      inclusivo +
      `\n\nMATERIALE DI STUDIO\nTitolo: ${material.title}\nMateria: ${material.subject}\nLivello: ${material.gradeLevel}\n\nContenuto:\n${material.content.slice(0, 8000)}`,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content }) as const),
      { role: "user" as const, content: question },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }
  return textBlock.text.trim();
}

export interface PhotoCorrectionResult {
  transcription: string;
  grade: number | null;
  feedback: string;
  strengths: string[];
  improvements: string[];
  /** Vuota se il modello non ha prodotto una diagnosi valida. */
  diagnosis: DiagnosedExercise[];
}

export const PhotoCorrectionSchema = z.object({
  transcription: z.string().default(""),
  grade: z.number().min(1).max(10).nullable().default(null),
  feedback: z.string().trim().default(""),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
});

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function correctPhotoHomework(
  imageBase64: string,
  mediaType: ImageMediaType,
  subject: string,
  gradeLevel: string,
  assignmentPrompt: string | null,
  candidates: ObjectiveCandidate[] = [],
): Promise<PhotoCorrectionResult> {
  const consegna = assignmentPrompt?.trim()
    ? `La consegna del compito era: "${assignmentPrompt.trim()}".`
    : "La consegna non e' stata specificata: deducila dal contenuto.";

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 3072,
    system:
      "Sei un docente italiano che corregge il compito scritto a mano di uno studente, fotografato e inviato come immagine. " +
      "Prima trascrivi fedelmente cio' che riesci a leggere nella foto (segnala con [illeggibile] le parti che non distingui). " +
      "Poi correggi: valuta la correttezza dei contenuti e, dove pertinente, forma ed esposizione, in modo adeguato al livello scolastico. " +
      "Assegna un voto in decimi (da 1 a 10) e un feedback costruttivo e incoraggiante in italiano, come farebbe un vero insegnante. " +
      "Sii equo: se la foto e' poco leggibile o incompleta, dillo e valuta solo cio' che vedi. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text:
              `Materia: ${subject}\nLivello scolastico: ${gradeLevel || "non specificato"}\n${consegna}` +
              diagnosisInstructions(candidates) +
              `\n\nCorreggi questo compito e rispondi con JSON: {"transcription": "cosa hai letto nella foto", "grade": numero_da_1_a_10_o_null, "feedback": "valutazione complessiva", "strengths": ["punto di forza", ...], "improvements": ["cosa migliorare", ...], "diagnosis": [{"exercise": "...", "objectiveCode": "..."|null, "outcome": "corretto|parziale|errato", "errorType": "concettuale|procedurale|distrazione"|null, "evidence": "..."}]}`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }
  const raw = extractJson<Record<string, unknown>>(textBlock.text);
  const parsed = PhotoCorrectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("La correzione dell'AI non e' nel formato atteso. Riprova.");
  }
  return { ...parsed.data, diagnosis: parseDiagnosis(raw.diagnosis, candidates) };
}

export interface NoticeDraftResult {
  title: string;
  body: string;
}

/**
 * Prepara la bozza di un avviso per la bacheca di classe.
 *
 * Non e' l'assistente che parla alla classe: scrive solo una prima stesura
 * a partire dagli appunti del docente, che poi la rilegge, la corregge e la
 * pubblica a proprio nome. Per questo il tono resta neutro e non aggiunge
 * mai contenuti che il docente non ha indicato.
 */
export async function draftClassNotice(
  hint: string,
  className: string,
  teacherName: string,
): Promise<NoticeDraftResult> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 800,
    system:
      "Aiuti un docente italiano a scrivere un avviso per la sua classe. " +
      "Scrivi in italiano, in modo chiaro, cortese e sintetico, come farebbe un insegnante che si rivolge ai propri studenti. " +
      "Usa il 'voi' rivolto alla classe. Non inventare date, luoghi, voti o dettagli che il docente non ha indicato: " +
      "se un dato manca, lascialo fuori invece di immaginarlo. Non firmare l'avviso. " +
      "Il titolo deve stare in poche parole. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Classe: ${className}\nDocente: ${teacherName}\n` +
          `Appunti del docente: ${hint}\n\n` +
          `Rispondi con JSON: {"title": "titolo breve", "body": "testo dell'avviso"}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }
  return extractJson<NoticeDraftResult>(textBlock.text);
}

export interface GiudizioResult {
  giudizio: string;
}

/**
 * Bozza del giudizio globale per lo scrutinio.
 *
 * Non e' un verdetto: e' una prima stesura che il consiglio rilegge, corregge
 * e approva. Per questo il prompt e' scritto in modo restrittivo:
 *
 *  - si basa SOLO sui numeri forniti, e non deve inventare episodi o qualita';
 *  - non propone ammissione o non ammissione, che restano decisioni del
 *    consiglio con valore legale;
 *  - non formula ipotesi diagnostiche ne' giudizi sulla persona;
 *  - se i dati sono pochi, lo dice invece di riempire di frasi fatte.
 */
export async function draftGiudizio(input: {
  studentName: string;
  className: string;
  gradeLevel: string;
  periodLabel: string;
  bySubject: Array<{ subject: string; average: number; count: number }>;
  overallAverage: number | null;
  gradesCount: number;
  trend: { first: number; last: number } | null;
  practice: { attempts: number; accuracyPercent: number | null };
}): Promise<GiudizioResult> {
  const materie = input.bySubject.length
    ? input.bySubject.map((s) => `${s.subject}: media ${s.average} su ${s.count} prove`).join("; ")
    : "nessuna prova valutata";
  const andamento = input.trend
    ? `primo voto del periodo ${input.trend.first}, ultimo ${input.trend.last}`
    : "andamento non ricostruibile (meno di due prove)";
  const impegno = input.practice.attempts
    ? `${input.practice.attempts} esercitazioni autonome svolte, ${input.practice.accuracyPercent ?? "n/d"}% di risposte corrette`
    : "nessuna esercitazione autonoma registrata";

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    system:
      "Scrivi la bozza del giudizio globale per lo scrutinio di una scuola superiore italiana. " +
      "Usa il registro sobrio e descrittivo dei documenti scolastici, in terza persona, 3-5 frasi. " +
      "REGOLE VINCOLANTI: " +
      "1) Basati esclusivamente sui dati forniti: non inventare episodi, atteggiamenti, qualita' o difficolta' che non risultino dai numeri. " +
      "2) NON proporre l'ammissione o la non ammissione alla classe successiva, e non usare formule come 'si propone la promozione': la decisione spetta al consiglio. " +
      "3) Non formulare ipotesi diagnostiche, non parlare di disturbi o certificazioni, non giudicare la persona: parla del rendimento osservato. " +
      "4) Se le prove sono poche, scrivilo con franchezza invece di riempire con frasi di circostanza. " +
      "5) Cita le materie per nome quando i dati lo consentono. " +
      "Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Studente: ${input.studentName}\nClasse: ${input.className} (${input.gradeLevel})\nPeriodo: ${input.periodLabel}\n` +
          `Valutazioni firmate dai docenti: ${input.gradesCount}\n` +
          `Medie per materia: ${materie}\n` +
          `Media complessiva: ${input.overallAverage ?? "non calcolabile"}\n` +
          `Andamento: ${andamento}\n` +
          `Impegno autonomo: ${impegno}\n\n` +
          `Rispondi con JSON: {"giudizio": "testo del giudizio"}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }
  return extractJson<GiudizioResult>(textBlock.text);
}

export interface RecoveryQuestionDraft {
  objectiveCode: string;
  question: string;
  answer: string;
  hints: string[];
}

export const RecoveryQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        objectiveCode: z.string().trim().min(1).max(40),
        question: z.string().trim().min(5).max(600),
        answer: z.string().trim().min(1).max(1200),
        hints: z.unknown().optional(),
      }),
    )
    .max(60),
});

/** Tiene solo le domande ben formate e riferite a un obiettivo richiesto. */
export function parseRecoveryQuestions(raw: unknown, codes: string[]): RecoveryQuestionDraft[] {
  const parsed = RecoveryQuestionsSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Le domande proposte dall'AI non sono nel formato atteso. Riprova.");
  const allowed = new Set(codes);
  return parsed.data.questions
    .filter((q) => allowed.has(q.objectiveCode))
    .map((q) => ({ ...q, hints: normalizeHints(q.hints) }));
}

/**
 * Bozza delle domande di richiamo per un set di recupero: poche, brevi, una
 * sola idea per domanda, risolvibili in un paio di minuti. Al modello vanno
 * solo gli obiettivi e i tipi di errore piu' frequenti nella classe: nessun
 * nome, nessun elaborato. Il docente rilegge e approva.
 */
export async function generateRecoveryQuestions(input: {
  subject: string;
  gradeLevel: string;
  perObjective: number;
  objectives: Array<{ code: string; title: string; description: string; commonError: string | null }>;
}): Promise<RecoveryQuestionDraft[]> {
  const list = input.objectives
    .map(
      (o) =>
        `- ${o.code}: ${o.title}. ${o.description}` +
        (o.commonError ? ` (errore piu' frequente nella classe: ${o.commonError})` : ""),
    )
    .join("\n");
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "Sei un docente italiano di scuola superiore che prepara richiami brevi per il recupero dopo una verifica. " +
      "Ogni domanda allena UN solo obiettivo, si risolve in uno o due minuti, e ha una risposta di riferimento chiara con il passaggio chiave. " +
      "Varia le domande dello stesso obiettivo: non ripetere gli stessi numeri. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel}\n\nObiettivi da riprendere:\n${list}\n\n` +
          `Scrivi ${input.perObjective} domande per ciascun obiettivo, ognuna con i suoi aiuti. ${HINTS_RULES} ` +
          `Rispondi con JSON: {"questions": [{"objectiveCode": "...", "question": "...", "answer": "...", "hints": ["...", "..."]}]}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  return parseRecoveryQuestions(
    extractJson<unknown>(textBlock.text),
    input.objectives.map((o) => o.code),
  );
}

export const HintsDraftSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), hints: z.unknown() })).max(80),
});

/** Tiene solo gli aiuti riferiti a una domanda richiesta, ripuliti. */
export function parseHintsDraft(raw: unknown, ids: number[]): Map<number, string[]> {
  const parsed = HintsDraftSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Gli aiuti proposti dall'AI non sono nel formato atteso. Riprova.");
  const allowed = new Set(ids);
  const out = new Map<number, string[]>();
  for (const item of parsed.data.items) {
    const hints = normalizeHints(item.hints);
    if (allowed.has(item.id) && hints.length) out.set(item.id, hints);
  }
  return out;
}

/**
 * Bozza degli aiuti per domande che ne sono prive. Al modello vanno solo
 * domanda e risposta attesa: nessun dato sugli studenti. Il docente rilegge.
 */
export async function generateHints(input: {
  subject: string;
  gradeLevel: string;
  questions: Array<{ id: number; question: string; answer: string }>;
}): Promise<Map<number, string[]>> {
  const list = input.questions
    .map((q) => `[${q.id}] Domanda: ${q.question}\nRisposta attesa: ${q.answer}`)
    .join("\n\n");
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "Sei un docente italiano di scuola superiore che prepara indizi per gli studenti che si bloccano su una domanda di ripasso. " +
      HINTS_RULES +
      " Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel}\n\n${list}\n\n` +
          `Scrivi gli aiuti per ciascuna domanda, usando il numero tra parentesi quadre come id. ` +
          `Rispondi con JSON: {"items": [{"id": 0, "hints": ["...", "..."]}]}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  return parseHintsDraft(
    extractJson<unknown>(textBlock.text),
    input.questions.map((q) => q.id),
  );
}

export const ActivityDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  activity: z.string().trim().min(20).max(4000),
});

/**
 * Bozza di un'attivita' di circa dieci minuti per riprendere in classe un
 * obiettivo. Al modello arrivano l'obiettivo, l'errore piu' frequente e quanti
 * studenti sono coinvolti: nessun nome. La conduce il docente, che la adatta.
 */
export async function draftRecoveryActivity(input: {
  subject: string;
  gradeLevel: string;
  objective: { code: string; title: string; description: string };
  commonError: string | null;
  groupSize: number;
  classSize: number;
}): Promise<{ title: string; activity: string }> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "Sei un docente italiano di scuola superiore esperto di didattica. Prepari la traccia di un'attivita' di circa dieci minuti che un collega condurra' in classe per riprendere un obiettivo. " +
      "Scrivi in modo operativo: cosa fa il docente, cosa fanno gli studenti, con tempi indicativi e un esempio concreto. Niente tecnologia obbligatoria. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel} (${input.classSize} studenti)\n` +
          `Obiettivo: ${input.objective.title}. ${input.objective.description}\n` +
          `Studenti che devono riprenderlo: ${input.groupSize}\n` +
          (input.commonError ? `Errore piu' frequente: ${input.commonError}\n` : "") +
          `\nRispondi con JSON: {"title": "titolo breve", "activity": "traccia dell'attivita' in testo semplice, con i tempi"}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  const parsed = ActivityDraftSchema.safeParse(extractJson<unknown>(textBlock.text));
  if (!parsed.success) throw new Error("La bozza dell'AI non e' nel formato atteso. Riprova.");
  return parsed.data;
}

export const FollowupExamSchema = z.object({ prompt: z.string().trim().min(20).max(6000) });

/**
 * Bozza della verifica di riscontro: breve, un esercizio per obiettivo, sugli
 * stessi obiettivi del recupero ma con dati diversi. Il docente la rilegge
 * prima di assegnarla. Al modello vanno solo gli obiettivi.
 */
export async function generateFollowupExam(input: {
  subject: string;
  gradeLevel: string;
  objectives: Array<{ code: string; title: string; description: string }>;
}): Promise<string> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "Sei un docente italiano di scuola superiore. Prepari una verifica breve (15-20 minuti) per controllare se un recupero ha funzionato. " +
      "Un esercizio numerato per ciascun obiettivo, di difficolta' media, con consegne chiare. Non includere le soluzioni. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel}\n\nObiettivi da verificare:\n` +
          input.objectives.map((o) => `- ${o.code}: ${o.title}. ${o.description}`).join("\n") +
          `\n\nRispondi con JSON: {"prompt": "testo completo della verifica, con gli esercizi numerati"}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  const parsed = FollowupExamSchema.safeParse(extractJson<unknown>(textBlock.text));
  if (!parsed.success) throw new Error("La verifica proposta dall'AI non e' nel formato atteso. Riprova.");
  return parsed.data.prompt;
}

// ---------------------------------------------------------------------------
// Assistente del corso
// ---------------------------------------------------------------------------

export interface CoursePassage {
  /** Etichetta con cui citare la fonte (titolo del documento o lezione con data). */
  source: string;
  content: string;
}

function formatPassages(passages: CoursePassage[], startAt = 1): string {
  if (!passages.length) return "(nessun passaggio trovato nel materiale del corso)";
  return passages.map((p, i) => `[${startAt + i}] ${p.source}\n${p.content}`).join("\n\n");
}

/**
 * La chat di ripasso sul corso. Il modello riceve i passaggi trovati per la
 * domanda e puo' cercarne altri con parole diverse (strumento cerca_nel_corso):
 * e' cosi' che una domanda detta "a parole proprie" trova il lessico del corso.
 * Risponde solo da quello che trova; se non c'e', lo dice.
 * Non riceve il nome dello studente ne' i suoi voti.
 */
export async function askCourseAssistant(input: {
  subject: string;
  gradeLevel: string;
  besDsa: boolean;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
  initialPassages: CoursePassage[];
  search: (query: string) => Promise<CoursePassage[]>;
  /** Se presente, la chat e' un'attivita' guidata assegnata dal docente. */
  guided?: { title: string; brief: string };
}): Promise<{ answer: string; usedPassages: CoursePassage[] }> {
  const used = [...input.initialPassages];
  const inclusivo = input.besDsa
    ? "Lo studente ha dichiarato BES/DSA: frasi brevi, lessico semplice, un concetto alla volta, elenchi puntati. "
    : "";
  const system =
    `Sei l'assistente di ripasso di Sillabo per il corso di ${input.subject} (${input.gradeLevel}). ` +
    "Aiuti uno studente a ripassare usando SOLO il materiale che il suo docente ha condiviso con la classe: documenti e trascrizioni delle lezioni. " +
    "Ti vengono dati dei passaggi numerati trovati nel corso. Se non bastano, usa lo strumento cerca_nel_corso con parole chiave diverse (i termini tecnici dell'argomento), al massimo due volte. " +
    "Rispondi in italiano, con tono caldo e chiaro. Cita le fonti tra parentesi quadre con il loro numero, es. [2]. " +
    "Se nel materiale del corso l'argomento non c'e', dillo con semplicita' e suggerisci di chiederlo al docente: non inventare e non attingere ad altre fonti. " +
    "Non svolgere i compiti al posto dello studente: spiega e guida. " +
    (input.guided
      ? `Questa e' un'attivita' guidata assegnata dal docente: «${input.guided.title}». Consegna del docente: ${input.guided.brief} ` +
        "Resta su questo argomento: se lo studente esce dal tema, riportalo con garbo alla consegna. " +
        "Guida con domande: parti da cio' che lo studente sa gia', dai un indizio alla volta e lascia a lui il passo successivo; non dare subito la soluzione completa. " +
        "Chiudi ogni risposta con una sola domanda breve che gli faccia fare un passo avanti o verifichi che abbia capito. "
      : "Quando ha senso, ricorda che puo' chiederti un piano di ripasso o di simulare un'interrogazione sull'argomento. ") +
    inclusivo;

  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    {
      role: "user",
      content: `Passaggi trovati nel corso:\n${formatPassages(input.initialPassages)}\n\nDomanda dello studente: ${input.question}`,
    },
  ];
  const tools: Anthropic.Tool[] = [
    {
      name: "cerca_nel_corso",
      description: "Cerca altri passaggi nei documenti e nelle lezioni del corso. Usa poche parole chiave specifiche.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "Parole chiave da cercare" } },
        required: ["query"],
      },
    },
  ];

  for (let round = 0; round < 3; round += 1) {
    const message = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages,
      // All'ultimo giro niente strumenti: deve rispondere con quello che ha.
      ...(round < 2 ? { tools } : {}),
    });
    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) {
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Anthropic non ha restituito testo");
      return { answer: text, usedPassages: used };
    }
    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const query = typeof (use.input as { query?: unknown }).query === "string" ? (use.input as { query: string }).query : "";
      const found = query ? await input.search(query.slice(0, 200)) : [];
      // Non ripetere passaggi gia' forniti; la numerazione prosegue.
      const fresh = found.filter((f) => !used.some((u) => u.content === f.content));
      const startAt = used.length + 1;
      used.push(...fresh);
      results.push({ type: "tool_result", tool_use_id: use.id, content: formatPassages(fresh, startAt) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("L'assistente non e' riuscito a concludere la risposta");
}

/**
 * Prima stesura di uno strumento per la lezione (errori tipici, spunti,
 * glossario, sintesi tradotta). Al modello va solo il materiale: nessun dato
 * sulla classe. E' una bozza che il docente rilegge.
 */
export async function draftMaterialTool(input: {
  instructions: string;
  language: string | null;
  title: string;
  subject: string;
  gradeLevel: string;
  content: string;
}): Promise<string> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 2500,
    system:
      "Sei un docente italiano di scuola superiore esperto di didattica, che prepara per un collega uno strumento di lavoro su un materiale di lezione. " +
      "Scrivi in modo concreto e sintetico, in testo semplice con elenchi; niente premesse ne' commenti finali. " +
      (input.language ? `Scrivi il testo in ${input.language}. ` : "Scrivi in italiano. ") +
      input.instructions,
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel}\nTitolo: ${input.title}\n\n` +
          `Materiale:\n${input.content.slice(0, 12000)}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  const text = textBlock.text.trim();
  if (text.length < 20) throw new Error("La bozza dell'AI e' troppo breve. Riprova.");
  return text;
}

export const GUIDED_LEVELS = ["sicuro", "incerto"] as const;

export const GuidedSummarySchema = z.object({
  signals: z
    .array(z.object({ objectiveCode: z.string().trim().min(1).max(40), level: z.enum(GUIDED_LEVELS) }))
    .max(20)
    .default([]),
  stuckPoints: z.array(z.string().trim().min(3).max(140)).max(3).default([]),
});

export interface GuidedSummary {
  signals: Array<{ objectiveCode: string; level: (typeof GUIDED_LEVELS)[number] }>;
  stuckPoints: string[];
}

/** Tiene solo i segnali riferiti a un obiettivo dell'attivita', uno per obiettivo. */
export function parseGuidedSummary(raw: unknown, codes: string[]): GuidedSummary {
  const parsed = GuidedSummarySchema.safeParse(raw);
  if (!parsed.success) return { signals: [], stuckPoints: [] };
  const allowed = new Set(codes);
  const seen = new Set<string>();
  const signals = parsed.data.signals.filter((s) => {
    if (!allowed.has(s.objectiveCode) || seen.has(s.objectiveCode)) return false;
    seen.add(s.objectiveCode);
    return true;
  });
  return { signals, stuckPoints: parsed.data.stuckPoints };
}

/**
 * Alla chiusura di un'attivita' guidata: che cosa e' emerso dalla
 * conversazione, in forma utile al riepilogo di classe. Parla di concetti,
 * mai della persona; il modello non riceve il nome dello studente e la
 * conversazione non viene conservata.
 */
export async function summarizeGuidedSession(input: {
  subject: string;
  title: string;
  brief: string;
  objectives: Array<{ code: string; title: string }>;
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<GuidedSummary> {
  const list = input.objectives.length
    ? input.objectives.map((o) => `- ${o.code}: ${o.title}`).join("\n")
    : "(nessun obiettivo indicato: lascia signals vuoto)";
  const dialogue = input.transcript
    .map((m) => `${m.role === "user" ? "Studente" : "Assistente"}: ${m.content.slice(0, 1500)}`)
    .join("\n");
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 800,
    system:
      "Leggi la conversazione di un'attivita' guidata di ripasso e riassumi che cosa e' emerso, per aiutare il docente a capire dove la classe fatica. " +
      "Per ciascun obiettivo EFFETTIVAMENTE toccato nella conversazione indica \"sicuro\" (lo studente ci e' arrivato senza difficolta' rilevanti) o \"incerto\" (ha avuto bisogno di piu' aiuti o ha mostrato confusione); gli obiettivi non toccati non vanno elencati. " +
      "In stuckPoints scrivi al massimo tre punti in cui ci si e' bloccati, ciascuno come concetto in poche parole (es. \"cambio di verso dividendo per un numero negativo\"). " +
      "Descrivi concetti, mai la persona: nessun giudizio, nessun riferimento allo studente. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nAttivita': ${input.title}\nConsegna: ${input.brief}\n\nObiettivi dell'attivita':\n${list}\n\nConversazione:\n${dialogue}\n\n` +
          `Rispondi con JSON: {"signals": [{"objectiveCode": "...", "level": "sicuro|incerto"}], "stuckPoints": ["..."]}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  return parseGuidedSummary(
    extractJson<unknown>(textBlock.text),
    input.objectives.map((o) => o.code),
  );
}

export const ReviewPlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).default(""),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        activity: z.string().trim().min(1).max(1500),
        minutes: z.number().int().min(5).max(120).default(20),
        sources: z.array(z.number().int().positive()).max(8).default([]),
      }),
    )
    .min(1)
    .max(8),
});
export type ReviewPlanDraft = z.infer<typeof ReviewPlanSchema>;

/**
 * Piano di ripasso su un argomento, costruito sui passaggi del corso. Dello
 * studente il modello conosce solo i titoli degli obiettivi che ha ancora da
 * consolidare in quella materia: servono a decidere su cosa insistere.
 */
export async function generateReviewPlan(input: {
  subject: string;
  gradeLevel: string;
  topic: string;
  besDsa: boolean;
  passages: CoursePassage[];
  objectivesToConsolidate: string[];
}): Promise<ReviewPlanDraft> {
  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 2500,
    system:
      "Sei un docente italiano che prepara un piano di ripasso breve e concreto per uno studente delle superiori, usando SOLO il materiale del corso fornito. " +
      "Da 3 a 6 passi, in ordine: ogni passo dice cosa rileggere o rifare e come verificare da soli di aver capito. " +
      "Nei 'sources' di ogni passo metti i numeri dei passaggi su cui si basa. Non inventare contenuti che non sono nei passaggi. " +
      (input.besDsa ? "Lo studente ha dichiarato BES/DSA: passi brevi, una sola cosa per passo, linguaggio semplice. " : "") +
      "Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${input.subject}\nClasse: ${input.gradeLevel}\nArgomento da ripassare: ${input.topic}\n` +
          (input.objectivesToConsolidate.length
            ? `Obiettivi che lo studente deve ancora consolidare: ${input.objectivesToConsolidate.join("; ")}\n`
            : "") +
          `\nPassaggi del corso:\n${formatPassages(input.passages)}\n\n` +
          `Rispondi con JSON: {"title": "...", "summary": "una frase", "steps": [{"title": "...", "activity": "...", "minutes": 20, "sources": [1, 2]}]}`,
      },
    ],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Anthropic non ha restituito testo");
  const parsed = ReviewPlanSchema.safeParse(extractJson<unknown>(textBlock.text));
  if (!parsed.success) throw new Error("Il piano proposto dall'AI non e' nel formato atteso. Riprova.");
  return parsed.data;
}
