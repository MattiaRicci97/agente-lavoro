import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { downloadObject } from "./storage";

export class UnsupportedFileTypeError extends Error {
  constructor(fileName: string) {
    super(`Formato file non supportato: ${fileName}. Sono ammessi solo PDF e Word (.pdf, .doc, .docx).`);
    this.name = "UnsupportedFileTypeError";
    Object.setPrototypeOf(this, UnsupportedFileTypeError.prototype);
  }
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
  if (!isPdf(fileName) && !isWord(fileName)) {
    throw new UnsupportedFileTypeError(fileName);
  }

  const buffer = await downloadObject(accessToken, objectPath);

  let text = "";
  if (isPdf(fileName)) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
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
