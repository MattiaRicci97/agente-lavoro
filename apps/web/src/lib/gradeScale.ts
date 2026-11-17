/**
 * La scala dei voti dell'istituto: decimi (scuola), trentesimi (universita'),
 * centesimi (spesso nelle business school). Le proposte dell'assistente sono
 * sempre in decimi e si convertono solo per mostrarle; il voto del docente e'
 * gia' nella scala del suo istituto.
 */
export type GradeScale = "decimi" | "trentesimi" | "centesimi";

/** In trentesimi, 31 rappresenta il 30 e lode. */
export const LODE = 31;

export const SCALE_RANGE: Record<GradeScale, { min: number; max: number; pass: number }> = {
  decimi: { min: 1, max: 10, pass: 6 },
  trentesimi: { min: 0, max: LODE, pass: 18 },
  centesimi: { min: 0, max: 100, pass: 60 },
};

export const SCALE_LABEL: Record<GradeScale, string> = {
  decimi: "In decimi (1–10)",
  trentesimi: "In trentesimi (18–30 e lode)",
  centesimi: "In centesimi (0–100)",
};

export function asScale(value: unknown): GradeScale {
  return value === "trentesimi" || value === "centesimi" ? value : "decimi";
}

/** Una proposta in decimi nella scala dell'istituto: la sufficienza resta sufficienza. */
export function fromTenths(grade: number | null | undefined, scale: GradeScale): number | null {
  if (grade === null || grade === undefined) return null;
  if (scale === "trentesimi") return Math.min(30, Math.round(grade * 3));
  if (scale === "centesimi") return Math.min(100, Math.round(grade * 10));
  return Math.round(grade);
}

/** "7/10", "27/30", "30 e lode", "78/100". */
export function formatGrade(grade: number | null | undefined, scale: GradeScale): string {
  if (grade === null || grade === undefined) return "—";
  if (scale === "trentesimi") return grade === LODE ? "30 e lode" : `${grade}/30`;
  if (scale === "centesimi") return `${grade}/100`;
  return `${grade}/10`;
}

/** Solo il numero ("27", "30L") e la base ("/30"), per i riquadri grandi. */
export function gradeParts(grade: number | null | undefined, scale: GradeScale): { value: string; base: string } {
  const base = scale === "trentesimi" ? "/30" : scale === "centesimi" ? "/100" : "/10";
  if (grade === null || grade === undefined) return { value: "—", base };
  if (scale === "trentesimi" && grade === LODE) return { value: "30L", base: "e lode" };
  return { value: String(grade), base };
}

/** true se il voto e' almeno la sufficienza della sua scala. */
export function isPassing(grade: number, scale: GradeScale): boolean {
  return grade >= SCALE_RANGE[scale].pass;
}
