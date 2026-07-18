// Saluto sensibile all'orario + estrazione di nome/cognome dal nome completo.

export function timeGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** Primo nome: la prima parola del nome completo. */
export function firstName(fullName?: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? "";
}

/** Cognome: tutto ciò che segue il primo nome (o l'unica parola se il nome è singolo). */
export function lastName(fullName?: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.slice(1).join(" ");
}
