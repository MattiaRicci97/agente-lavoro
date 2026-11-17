import { z } from "zod/v4";

/**
 * Prove in stile INVALSI: le regole che non dipendono dal database.
 * Materie e anni sono quelli delle rilevazioni nella secondaria di secondo
 * grado (seconda e quinta); l'inglese qui e' solo lettura, non ascolto.
 */
export const INVALSI_SUBJECTS = ["Italiano", "Matematica", "Inglese"] as const;
export const INVALSI_GRADES = ["2ª Superiore", "5ª Superiore"] as const;
export const OPTIONS_PER_ITEM = 4;
export const MIN_ITEMS_TO_PUBLISH = 5;
export const MAX_ITEMS = 30;

export const ItemSchema = z.object({
  question: z.string().trim().min(5).max(1200),
  options: z.array(z.string().trim().min(1).max(400)).length(OPTIONS_PER_ITEM),
  correctIndex: z.number().int().min(0).max(OPTIONS_PER_ITEM - 1),
  explanation: z.string().trim().max(1200).default(""),
  area: z.string().trim().max(80).default(""),
});
export type ItemDraft = z.infer<typeof ItemSchema>;

const GeneratedSchema = z.object({
  title: z.string().trim().min(3).max(140),
  passage: z.string().trim().max(8000).nullable().optional(),
  items: z.array(z.unknown()).max(60),
});

/**
 * Valida la prova proposta dal modello: i quesiti malformati (alternative
 * mancanti o ripetute, indice fuori scala) vengono scartati uno a uno invece
 * di far fallire tutto.
 */
export function parseGeneratedTest(raw: unknown): { title: string; passage: string | null; items: ItemDraft[] } {
  const parsed = GeneratedSchema.safeParse(raw);
  if (!parsed.success) throw new Error("La prova proposta dall'AI non e' nel formato atteso. Riprova.");
  const items: ItemDraft[] = [];
  for (const candidate of parsed.data.items) {
    const item = ItemSchema.safeParse(candidate);
    if (!item.success) continue;
    const distinct = new Set(item.data.options.map((o) => o.toLowerCase()));
    if (distinct.size !== OPTIONS_PER_ITEM) continue;
    items.push(item.data);
  }
  return { title: parsed.data.title, passage: parsed.data.passage?.trim() || null, items: items.slice(0, MAX_ITEMS) };
}

export interface ScoredItem {
  id: number;
  correctIndex: number;
}

/** Quante risposte giuste: una risposta mancante o fuori scala vale come sbagliata. */
export function scoreAttempt(items: ScoredItem[], answers: Record<string, number | null>): { score: number; total: number } {
  let score = 0;
  for (const item of items) if (answers[String(item.id)] === item.correctIndex) score += 1;
  return { score, total: items.length };
}

/** Tiene solo le risposte a quesiti della prova, con un indice valido o null. */
export function cleanAnswers(items: ScoredItem[], raw: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const item of items) {
    const value = raw[String(item.id)];
    out[String(item.id)] = typeof value === "number" && Number.isInteger(value) && value >= 0 && value < OPTIONS_PER_ITEM ? value : null;
  }
  return out;
}

/** Per ogni quesito, quanti hanno risposto giusto e quale alternativa sbagliata ha attirato di piu'. */
export function itemStats(
  items: ScoredItem[],
  attempts: Array<{ answers: Record<string, number | null> }>,
): Array<{ id: number; correct: number; answered: number; blank: number; topWrongIndex: number | null }> {
  return items.map((item) => {
    let correct = 0;
    let blank = 0;
    const wrong = new Map<number, number>();
    for (const a of attempts) {
      const chosen = a.answers[String(item.id)];
      if (chosen === null || chosen === undefined) blank += 1;
      else if (chosen === item.correctIndex) correct += 1;
      else wrong.set(chosen, (wrong.get(chosen) ?? 0) + 1);
    }
    const top = Array.from(wrong.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return { id: item.id, correct, answered: attempts.length - blank, blank, topWrongIndex: top ? top[0] : null };
  });
}
