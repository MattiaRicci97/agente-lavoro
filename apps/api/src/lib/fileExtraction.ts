import { stripSubtitleMarkup } from "./courseSearch";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { downloadObject } from "./storage";

export class UnsupportedFileTypeError extends Error {
  constructor(fileName: string) {
    super(`Formato file non supportato: ${fileName}. Sono ammessi PDF, Word (.pdf, .doc, .docx) e, per le trascrizioni, testo o sottotitoli (.txt, .vtt, .srt).`);
    this.name = "UnsupportedFileTypeError";
    Object.setPrototypeOf(this, UnsupportedFileTypeError.prototype);
  }
}

function isPlainText(fileName: string): boolean {
  return /\.(txt|vtt|srt|md)$/i.test(fileName);
}

export class EmptyExtractedContentError extends Error {
  constructor(fileName: string) {
    super(
      `Non e' stato possibile estrarre del testo dal file "${fileName}". ` +
        "Potrebbe trattarsi di un PDF composto solo da immagini scansionate.",
    );
    this.name = "EmptyExtractedContentError";
    Object.setPrototypeOf(this, EmptyExtractedContentError.prototype);
  }
}

function isPdf(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}

function isWord(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".doc");
}

/**
 * Downloads the uploaded object from Supabase Storage and extracts plain text
 * from PDF or Word (.doc/.docx) documents so it can be used as material
 * content for AI processing (question generation, classification, etc).
 */
export async function extractTextFromUploadedFile(
  accessToken: string,
  objectPath: string,
  fileName: string,
): Promise<string> {
  if (!isPdf(fileName) && !isWord(fileName) && !isPlainText(fileName)) {
    throw new UnsupportedFileTypeError(fileName);
  }

  const buffer = await downloadObject(accessToken, objectPath);

  let text = "";
  if (isPlainText(fileName)) {
    // Trascrizioni: testo semplice o sottotitoli esportati da Meet/Teams/registratori.
    const raw = Buffer.from(buffer).toString("utf8").replace(/^\uFEFF/, "");
    text = /\.(vtt|srt)$/i.test(fileName) ? stripSubtitleMarkup(raw) : raw;
  } else if (isPdf(fileName)) {
    // unpdf: estrazione testo pensata per il serverless (niente canvas/DOMMatrix).
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  } else {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  }

  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!text) {
    throw new EmptyExtractedContentError(fileName);
  }

  return text;
}
