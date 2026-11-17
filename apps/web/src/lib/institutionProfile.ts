import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";

export type InstitutionKind = "scuola" | "universita" | "business_school";
export type OptionalFeature = "registro" | "scrutinio" | "invalsi" | "maturita" | "edfin" | "moduli" | "catalogo_nazionale";

export interface InstitutionProfile {
  kind: InstitutionKind;
  label: string;
  hidden: OptionalFeature[];
  terms: { group: string; groups: string; learner: string; learners: string };
  adminInstitutions: Array<{ id: number; name: string; kind: InstitutionKind }>;
  kinds: Array<{ kind: InstitutionKind; label: string }>;
}

/** Finche' il profilo non arriva vale la scuola, che mostra tutto. */
const SCHOOL: InstitutionProfile = {
  kind: "scuola",
  label: "Scuola superiore",
  hidden: [],
  terms: { group: "classe", groups: "classi", learner: "studente", learners: "studenti" },
  adminInstitutions: [],
  kinds: [],
};

export const PROFILE_QUERY_KEY = ["myInstitutionProfile"];

/**
 * Il profilo d'istituto di chi usa l'app: quali funzioni mostrare e con quali
 * parole ("classe" o "corso", "studente" o "partecipante").
 */
export function useInstitutionProfile() {
  const { data } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => customFetch<InstitutionProfile>("/api/me/profile", { responseType: "json" }),
    staleTime: 5 * 60 * 1000,
  });
  const profile = data ?? SCHOOL;
  return {
    profile,
    shows: (feature: OptionalFeature) => !profile.hidden.includes(feature),
    terms: profile.terms,
  };
}

/** "classe" -> "Classe" */
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
