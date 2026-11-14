import { eq, and, inArray, sql } from "drizzle-orm";
import { db, pool, materialsTable, materialClassesTable, courseChunksTable } from "@sillabo/db";

/**
 * Ricerca nell'archivio del corso.
 *
 * Un "corso" e' una materia dentro una classe: tutti i materiali di quella
 * materia assegnati a quella classe, documenti e trascrizioni di lezione.
 * La ricerca e' a tutto testo in italiano (Postgres), per parole: nessun
 * servizio esterno, nessun dato che esce dal database.
 */

const CHUNK_SIZE = 1200;

/** Spezza un testo in passaggi di circa CHUNK_SIZE caratteri, senza tagliare i paragrafi quando si puo'. */
export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const paragraph of paragraphs) {
    // Un paragrafo troppo lungo (tipico delle trascrizioni) si taglia a frasi.
    const pieces = paragraph.length > size ? (paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph]) : [paragraph];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > size) flush();
      if (piece.length > size) {
        for (let i = 0; i < piece.length; i += size) chunks.push(piece.slice(i, i + size).trim());
        continue;
      }
      current += (current ? (pieces.length > 1 ? " " : "\n\n") : "") + piece.trim();
    }
  }
  flush();
  return chunks;
}

/** Toglie numerazione e orari dai sottotitoli (.vtt, .srt): resta solo il parlato. */
export function stripSubtitleMarkup(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (!l) return true;
      if (/^WEBVTT/i.test(l) || /^NOTE\b/.test(l)) return false;
      if (/^\d+$/.test(l)) return false;
      if (/\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}\s*-->/.test(l)) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .join("\n")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "che chi con cosa come dei del della delle dello degli dal dalla per piu non una uno gli nel nella nelle sono sul sulla tra fra mi ti si lo la le il un ed ma se era essere fare voglio vorrei ripassare ripasso spiegami spiega puoi posso devo quando dove quale quali questo questa quello quella anche poi cui".split(
    " ",
  ),
);

/**
 * Trasforma una domanda in una query di ricerca: le parole significative,
 * in OR e con prefisso. Singolari e plurali li unisce lo stemmer italiano.
 * Restituisce null se non resta nulla da cercare.
 */
export function buildTsQuery(question: string): string | null {
  const words = Array.from(
    new Set(
      (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 12);
  if (!words.length) return null;
  // La parola resta intera: e' lo stemmer italiano di Postgres a ridurla alla radice.
  return words.map((w) => `${w}:*`).join(" | ");
}

/** (Ri)costruisce i passaggi di un materiale. */
export async function indexMaterial(material: { id: number; content: string }): Promise<number> {
  const chunks = chunkText(material.content);
  await db.transaction(async (tx) => {
    await tx.delete(courseChunksTable).where(eq(courseChunksTable.materialId, material.id));
    if (chunks.length) {
      await tx.insert(courseChunksTable).values(chunks.map((content, ord) => ({ materialId: material.id, ord, content })));
    }
  });
  return chunks.length;
}

export interface CourseMaterial {
  id: number;
  title: string;
  kind: string;
  lessonDate: string | null;
}

/** I materiali di un corso (materia dentro una classe). */
export async function courseMaterials(classId: number, subject: string): Promise<CourseMaterial[]> {
  return db
    .select({ id: materialsTable.id, title: materialsTable.title, kind: materialsTable.kind, lessonDate: materialsTable.lessonDate })
    .from(materialsTable)
    .innerJoin(materialClassesTable, eq(materialClassesTable.materialId, materialsTable.id))
    .where(and(eq(materialClassesTable.classId, classId), sql`lower(${materialsTable.subject}) = lower(${subject})`))
    .orderBy(materialsTable.createdAt);
}

/** Indicizza i materiali che non lo sono ancora (quelli caricati prima dell'archivio). */
async function ensureIndexed(materialIds: number[]): Promise<void> {
  if (!materialIds.length) return;
  const indexed = await db
    .selectDistinct({ materialId: courseChunksTable.materialId })
    .from(courseChunksTable)
    .where(inArray(courseChunksTable.materialId, materialIds));
  const have = new Set(indexed.map((r) => r.materialId));
  const missing = materialIds.filter((id) => !have.has(id));
  if (!missing.length) return;
  const rows = await db
    .select({ id: materialsTable.id, content: materialsTable.content })
    .from(materialsTable)
    .where(inArray(materialsTable.id, missing));
  for (const m of rows) await indexMaterial(m);
}

export interface Passage {
  materialId: number;
  title: string;
  kind: string;
  lessonDate: string | null;
  content: string;
}

/** I passaggi del corso piu' pertinenti a una domanda. */
export async function searchCourse(input: { classId: number; subject: string; query: string; limit?: number }): Promise<Passage[]> {
  const materials = await courseMaterials(input.classId, input.subject);
  if (!materials.length) return [];
  const ids = materials.map((m) => m.id);
  await ensureIndexed(ids);
  const tsquery = buildTsQuery(input.query);
  if (!tsquery) return [];
  const { rows } = await pool.query<{ material_id: number; content: string }>(
    `SELECT c.material_id, c.content
       FROM course_chunks c
      WHERE c.material_id = ANY($1::int[])
        AND to_tsvector('italian', c.content) @@ to_tsquery('italian', $2)
      ORDER BY ts_rank_cd(to_tsvector('italian', c.content), to_tsquery('italian', $2)) DESC, c.material_id, c.ord
      LIMIT $3`,
    [ids, tsquery, input.limit ?? 6],
  );
  const byId = new Map(materials.map((m) => [m.id, m]));
  return rows.map((r) => {
    const m = byId.get(r.material_id)!;
    return { materialId: m.id, title: m.title, kind: m.kind, lessonDate: m.lessonDate, content: r.content };
  });
}

/** Come si cita una fonte allo studente. */
export function sourceLabel(p: { title: string; kind: string; lessonDate: string | null }): string {
  if (p.kind !== "lezione") return p.title;
  const date = p.lessonDate
    ? new Date(`${p.lessonDate}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "UTC" })
    : null;
  return date ? `Lezione del ${date}: ${p.title}` : `Lezione: ${p.title}`;
}
