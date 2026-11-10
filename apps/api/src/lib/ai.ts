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
}

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
          `Rispondi con un array JSON del tipo: [{"question": "...", "answer": "...", "topic": "...", "difficulty": "facile|medio|difficile"}]`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  const parsed = extractJson<GeneratedQuestion[]>(textBlock.text);
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
};

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
    max_tokens: 2048,
    system:
      "Sei un docente italiano che prepara verifiche scritte nel formato reale usato nelle scuole superiori italiane. " +
      `Il formato richiesto e': ${label}. ` +
      "Genera una traccia completa, pronta per essere consegnata a uno studente, coerente con il materiale fornito. Scrivi solo la traccia, in italiano, senza commenti aggiuntivi. Non usare JSON, scrivi testo semplice/markdown.",
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
): Promise<WrittenExamGradeResult> {
  const label = EXAM_TYPE_LABELS[examType] ?? examType;

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
          diagnosisInstructions(candidates) +
          `\n\nRispondi con JSON: {"grade": numero_da_1_a_10, "feedback": "...", "diagnosis": [{"exercise": "...", "objectiveCode": "..."|null, "outcome": "corretto|parziale|errato", "errorType": "concettuale|procedurale|distrazione"|null, "evidence": "..."}]}`,
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
  return { ...graded.data, diagnosis: parseDiagnosis(raw.diagnosis, candidates) };
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
}

export const RecoveryQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        objectiveCode: z.string().trim().min(1).max(40),
        question: z.string().trim().min(5).max(600),
        answer: z.string().trim().min(1).max(1200),
      }),
    )
    .max(60),
});

/** Tiene solo le domande ben formate e riferite a un obiettivo richiesto. */
export function parseRecoveryQuestions(raw: unknown, codes: string[]): RecoveryQuestionDraft[] {
  const parsed = RecoveryQuestionsSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Le domande proposte dall'AI non sono nel formato atteso. Riprova.");
  const allowed = new Set(codes);
  return parsed.data.questions.filter((q) => allowed.has(q.objectiveCode));
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
          `Scrivi ${input.perObjective} domande per ciascun obiettivo. ` +
          `Rispondi con JSON: {"questions": [{"objectiveCode": "...", "question": "...", "answer": "..."}]}`,
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
