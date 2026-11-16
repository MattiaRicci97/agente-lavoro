import { z } from "zod/v4";
import type { RubricCriterion, RubricScore } from "@sillabo/db";

/**
 * La griglia di valutazione di una verifica scritta.
 *
 * Pochi criteri, ciascuno con un peso: l'assistente ne propone una prima
 * stesura, il docente la fa sua e la approva. Da quel momento gli studenti la
 * vedono insieme alla traccia e la correzione la usa come riferimento. Il
 * voto resta quello che firma il docente: la media pesata e' solo un
 * suggerimento.
 */

export const MIN_CRITERIA = 2;
export const MAX_CRITERIA = 6;

export const RubricCriterionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(""),
  weight: z.number().min(1).max(100),
});

export const RubricSchema = z.array(RubricCriterionSchema).min(MIN_CRITERIA).max(MAX_CRITERIA);

/**
 * Riporta i pesi a numeri interi che sommano a 100, mantenendo le proporzioni.
 * Toglie anche i criteri con lo stesso nome (resta il primo).
 */
export function normalizeRubric(criteria: RubricCriterion[]): RubricCriterion[] {
  const seen = new Set<string>();
  const unique = criteria.filter((c) => {
    const key = c.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const total = unique.reduce((sum, c) => sum + c.weight, 0);
  if (!unique.length || total <= 0) return [];
  const scaled = unique.map((c) => ({ ...c, name: c.name.trim(), weight: Math.max(1, Math.round((c.weight / total) * 100)) }));
  // L'arrotondamento puo' lasciare uno scarto: lo assorbe il criterio piu' pesante.
  const drift = 100 - scaled.reduce((sum, c) => sum + c.weight, 0);
  if (drift !== 0) {
    const heaviest = scaled.reduce((best, c) => (c.weight > best.weight ? c : best), scaled[0]);
    heaviest.weight += drift;
  }
  return scaled;
}

/** Valida una griglia proposta (dal modello o dal docente) e ne sistema i pesi. */
export function parseRubric(raw: unknown): RubricCriterion[] {
  const parsed = RubricSchema.safeParse(raw);
  if (!parsed.success) throw new RubricError("La griglia deve avere da 2 a 6 criteri, ciascuno con un nome e un peso.");
  const normalized = normalizeRubric(parsed.data);
  if (normalized.length < MIN_CRITERIA) throw new RubricError("La griglia deve avere almeno due criteri diversi.");
  return normalized;
}

const ScoreSchema = z.object({
  criterion: z.string().trim().min(1).max(80),
  score: z.number().min(1).max(10),
  note: z.string().trim().max(400).optional().default(""),
});

/**
 * I punteggi per criterio, riferiti a una griglia: tiene solo i criteri che
 * esistono davvero, uno per criterio, nell'ordine della griglia. Qualsiasi
 * altra cosa viene scartata senza far fallire la correzione.
 */
export function parseRubricScores(raw: unknown, rubric: RubricCriterion[]): RubricScore[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, RubricScore>();
  for (const item of raw) {
    const parsed = ScoreSchema.safeParse(item);
    if (!parsed.success) continue;
    const key = parsed.data.criterion.toLowerCase();
    if (!byName.has(key)) byName.set(key, { ...parsed.data, score: Math.round(parsed.data.score) });
  }
  return rubric
    .map((c) => {
      const hit = byName.get(c.name.toLowerCase());
      return hit ? { criterion: c.name, score: hit.score, note: hit.note } : null;
    })
    .filter((s): s is RubricScore => s !== null);
}

/** Media pesata dei punteggi (1-10), o null se manca anche un solo criterio. */
export function weightedGrade(rubric: RubricCriterion[], scores: RubricScore[]): number | null {
  if (!rubric.length) return null;
  const byName = new Map(scores.map((s) => [s.criterion.toLowerCase(), s.score]));
  let sum = 0;
  for (const c of rubric) {
    const score = byName.get(c.name.toLowerCase());
    if (score === undefined) return null;
    sum += score * c.weight;
  }
  return Math.round((sum / 100) * 10) / 10;
}

/**
 * I punteggi che il docente firma: per ogni criterio vale il suo numero se lo
 * ha indicato, altrimenti la proposta dell'assistente. La nota resta quella
 * della proposta.
 */
export function mergeTeacherScores(
  rubric: RubricCriterion[],
  proposed: RubricScore[],
  teacher: Array<{ criterion: string; score: number }>,
): RubricScore[] {
  const mine = new Map(teacher.map((t) => [t.criterion.toLowerCase(), Math.round(t.score)]));
  const ai = new Map(proposed.map((p) => [p.criterion.toLowerCase(), p]));
  const out: RubricScore[] = [];
  for (const c of rubric) {
    const key = c.name.toLowerCase();
    const score = mine.get(key) ?? ai.get(key)?.score;
    if (score === undefined) continue;
    out.push({ criterion: c.name, score, note: ai.get(key)?.note ?? "" });
  }
  return out;
}

export class RubricError extends Error {}
