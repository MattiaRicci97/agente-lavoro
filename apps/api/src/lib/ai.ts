import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY deve essere impostata per le funzioni AI (vedi .env.example nella radice del repo)",
  );
}

const anthropic = new Anthropic();

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{") === -1 ? raw.indexOf("[") : Math.min(...[raw.indexOf("{"), raw.indexOf("[")].filter((n) => n !== -1));
  const lastBrace = raw.lastIndexOf("}");
  const lastBracket = raw.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  const slice = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(slice.trim()) as T;
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
  const message = await anthropic.messages.create({
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
  const message = await anthropic.messages.create({
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
}

export async function classifyCurriculumTopic(
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
): Promise<CurriculumTagResult> {
  const message = await anthropic.messages.create({
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
          `Materia: ${subject}\nLivello scolastico: ${gradeLevel}\nTitolo materiale: ${materialTitle}\n\nContenuto:\n${content.slice(0, 4000)}\n\n` +
          `Rispondi con JSON: {"topic": "macro-argomento del programma", "subtopic": "sotto-argomento specifico"}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return extractJson<CurriculumTagResult>(textBlock.text);
}

export async function generateSimplifiedContent(
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
): Promise<string> {
  const message = await anthropic.messages.create({
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

  const message = await anthropic.messages.create({
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

export interface WrittenExamGradeResult {
  grade: number;
  feedback: string;
}

export async function gradeWrittenExam(
  examType: string,
  prompt: string,
  subject: string,
  studentAnswer: string,
): Promise<WrittenExamGradeResult> {
  const label = EXAM_TYPE_LABELS[examType] ?? examType;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "Sei un docente italiano che corregge verifiche scritte nel formato reale delle scuole superiori. " +
      `Il formato e': ${label}. ` +
      "Valuta l'elaborato dello studente con un voto in decimi (da 1 a 10, anche con mezzi punti arrotondati all'intero piu' vicino) e un feedback dettagliato e costruttivo in italiano, come farebbe un vero insegnante, indicando punti di forza e aspetti da migliorare. Rispondi SOLO con JSON valido.",
    messages: [
      {
        role: "user",
        content:
          `Materia: ${subject}\nTraccia:\n${prompt}\n\nElaborato dello studente:\n${studentAnswer}\n\n` +
          `Rispondi con JSON: {"grade": numero_da_1_a_10, "feedback": "..."}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }

  return extractJson<WrittenExamGradeResult>(textBlock.text);
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

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
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
