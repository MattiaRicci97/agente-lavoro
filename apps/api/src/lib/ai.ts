import Anthropic from "@anthropic-ai/sdk";
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

function extractJson<T>(text: string): T {
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
}

export async function classifyCurriculumTopic(
  materialTitle: string,
  subject: string,
  gradeLevel: string,
  content: string,
): Promise<CurriculumTagResult> {
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

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 2048,
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
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Corregge un compito scritto a mano fotografato usando la visione di Claude:
 * legge la grafia, valuta, assegna un voto e dà feedback costruttivo.
 */
export async function correctPhotoHomework(
  imageBase64: string,
  mediaType: ImageMediaType,
  subject: string,
  gradeLevel: string,
  assignmentPrompt: string | null,
): Promise<PhotoCorrectionResult> {
  const consegna = assignmentPrompt?.trim()
    ? `La consegna del compito era: "${assignmentPrompt.trim()}".`
    : "La consegna non e' stata specificata: deducila dal contenuto.";

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 2048,
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
              `Materia: ${subject}\nLivello scolastico: ${gradeLevel || "non specificato"}\n${consegna}\n\n` +
              `Correggi questo compito e rispondi con JSON: {"transcription": "cosa hai letto nella foto", "grade": numero_da_1_a_10_o_null, "feedback": "valutazione complessiva", "strengths": ["punto di forza", ...], "improvements": ["cosa migliorare", ...]}`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic non ha restituito testo");
  }
  return extractJson<PhotoCorrectionResult>(textBlock.text);
}
