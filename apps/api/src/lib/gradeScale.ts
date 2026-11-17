import { eq, inArray } from "drizzle-orm";
import { db, classesTable, institutionsTable } from "@sillabo/db";
import { isInstitutionKind, type InstitutionKind } from "./institutionProfile";

/**
 * La scala dei voti. Lo stesso compito si valuta in decimi a scuola, in
 * trentesimi all'universita' e spesso in centesimi in una business school.
 *
 * L'assistente propone sempre in decimi (e' la scala su cui ragiona meglio e
 * su cui sono scritte le griglie); la proposta si converte solo per mostrarla.
 * Il voto del docente invece si salva nella scala del suo istituto, cosi' com'e'.
 */
export const GRADE_SCALES = ["decimi", "trentesimi", "centesimi"] as const;
export type GradeScale = (typeof GRADE_SCALES)[number];

/** In trentesimi, 31 rappresenta il 30 e lode. */
export const LODE = 31;

export const SCALE_RANGE: Record<GradeScale, { min: number; max: number; pass: number }> = {
  decimi: { min: 1, max: 10, pass: 6 },
  trentesimi: { min: 0, max: LODE, pass: 18 },
  centesimi: { min: 0, max: 100, pass: 60 },
};

const DEFAULT_FOR_KIND: Record<InstitutionKind, GradeScale> = {
  scuola: "decimi",
  universita: "trentesimi",
  business_school: "centesimi",
};

export function isGradeScale(value: unknown): value is GradeScale {
  return typeof value === "string" && (GRADE_SCALES as readonly string[]).includes(value);
}

/** La scala di un istituto: quella scelta, altrimenti quella tipica del suo tipo. */
export function scaleFor(kind: string, override?: string | null): GradeScale {
  if (isGradeScale(override)) return override;
  return isInstitutionKind(kind) ? DEFAULT_FOR_KIND[kind] : "decimi";
}

/** true se il voto e' un intero dentro la scala. */
export function isValidGrade(grade: number, scale: GradeScale): boolean {
  const r = SCALE_RANGE[scale];
  return Number.isInteger(grade) && grade >= r.min && grade <= r.max;
}

/**
 * Una proposta in decimi portata nella scala dell'istituto. La sufficienza
 * resta sufficienza (6 -> 18 -> 60) e l'assistente non propone mai la lode.
 */
export function fromTenths(grade: number | null, scale: GradeScale): number | null {
  if (grade === null) return null;
  if (scale === "trentesimi") return Math.min(30, Math.round(grade * 3));
  if (scale === "centesimi") return Math.min(100, Math.round(grade * 10));
  return Math.round(grade);
}

/** "7/10", "27/30", "30 e lode", "78/100". */
export function formatGrade(grade: number | null, scale: GradeScale): string {
  if (grade === null) return "—";
  if (scale === "trentesimi") return grade === LODE ? "30 e lode" : `${grade}/30`;
  if (scale === "centesimi") return `${grade}/100`;
  return `${grade}/10`;
}

/** La scala di ogni classe, da quella del suo istituto. */
export async function scalesForClasses(classIds: number[]): Promise<Map<number, GradeScale>> {
  const ids = Array.from(new Set(classIds));
  if (!ids.length) return new Map();
  const rows = await db
    .select({ classId: classesTable.id, kind: institutionsTable.kind, gradeScale: institutionsTable.gradeScale })
    .from(classesTable)
    .innerJoin(institutionsTable, eq(institutionsTable.id, classesTable.institutionId))
    .where(inArray(classesTable.id, ids));
  return new Map(rows.map((r) => [r.classId, scaleFor(r.kind, r.gradeScale)]));
}

/** La scala di una classe; senza classe, i decimi. */
export async function scaleForClass(classId: number | null | undefined): Promise<GradeScale> {
  if (classId === null || classId === undefined) return "decimi";
  return (await scalesForClasses([classId])).get(classId) ?? "decimi";
}

/**
 * Cio' che vede lo studente di una correzione preparata da un tutor e non
 * ancora confermata dal docente: niente, e' ancora "in correzione".
 */
export function hideUnconfirmed<T extends { validationStatus: string; teacherGrade: number | null; teacherFeedback: string | null }>(
  row: T,
): T {
  if (row.validationStatus !== "da_confermare") return row;
  return { ...row, validationStatus: "da_validare", teacherGrade: null, teacherFeedback: null };
}
