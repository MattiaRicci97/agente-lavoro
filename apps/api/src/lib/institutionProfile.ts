/**
 * Il profilo d'istituto: lo stesso Sillabo, presentato in modo diverso a una
 * scuola superiore, a un'universita' o a una business school. Decide quali
 * funzioni compaiono (le altre restano nel prodotto, solo nascoste) e quali
 * parole usa l'interfaccia.
 */
export const INSTITUTION_KINDS = ["scuola", "universita", "business_school"] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/** Le funzioni che un profilo puo' nascondere. */
export const OPTIONAL_FEATURES = ["registro", "scrutinio", "invalsi", "maturita", "edfin", "moduli", "catalogo_nazionale"] as const;
export type OptionalFeature = (typeof OPTIONAL_FEATURES)[number];

export interface ProfileTerms {
  /** "classe" | "corso" */
  group: string;
  groups: string;
  /** "studente" | "partecipante" */
  learner: string;
  learners: string;
}

export interface InstitutionProfile {
  kind: InstitutionKind;
  label: string;
  hidden: OptionalFeature[];
  terms: ProfileTerms;
}

/** Fuori dalla scuola non servono gli adempimenti e le prove nazionali italiane. */
const NOT_SCHOOL: OptionalFeature[] = ["registro", "scrutinio", "invalsi", "maturita", "edfin", "moduli", "catalogo_nazionale"];

export const PROFILES: Record<InstitutionKind, InstitutionProfile> = {
  scuola: {
    kind: "scuola",
    label: "Scuola superiore",
    hidden: [],
    terms: { group: "classe", groups: "classi", learner: "studente", learners: "studenti" },
  },
  universita: {
    kind: "universita",
    label: "Università",
    hidden: NOT_SCHOOL,
    terms: { group: "corso", groups: "corsi", learner: "studente", learners: "studenti" },
  },
  business_school: {
    kind: "business_school",
    label: "Business school",
    hidden: NOT_SCHOOL,
    terms: { group: "corso", groups: "corsi", learner: "partecipante", learners: "partecipanti" },
  },
};

export function isInstitutionKind(value: unknown): value is InstitutionKind {
  return typeof value === "string" && (INSTITUTION_KINDS as readonly string[]).includes(value);
}

/**
 * Il profilo di chi lavora in uno o piu' istituti. Se sono tutti dello stesso
 * tipo vale quello; se sono di tipi diversi (un docente che insegna sia a
 * scuola sia all'universita') vale la scuola, che mostra tutto: nascondere una
 * funzione che serve e' peggio che mostrarne una in piu'.
 */
export function resolveProfile(kinds: string[]): InstitutionProfile {
  const known = kinds.filter(isInstitutionKind);
  if (!known.length) return PROFILES.scuola;
  const distinct = new Set(known);
  return distinct.size === 1 ? PROFILES[known[0]] : PROFILES.scuola;
}

/** true se il catalogo nazionale degli obiettivi (Indicazioni nazionali) vale per questi istituti. */
export function usesNationalCatalog(kinds: string[]): boolean {
  return !resolveProfile(kinds).hidden.includes("catalogo_nazionale");
}
