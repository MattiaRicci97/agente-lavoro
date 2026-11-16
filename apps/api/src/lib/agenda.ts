/**
 * "Cosa devo fare": le cose aperte di uno studente, raccolte da tutta la
 * piattaforma e messe in ordine. Qui sta solo l'ordinamento, senza database,
 * cosi' si puo' provare da solo.
 */

export type AgendaKind = "compito" | "attivita" | "recupero" | "verifica";

export interface AgendaItem {
  kind: AgendaKind;
  title: string;
  /** Materia o altra riga di contesto. */
  subtitle: string;
  /** YYYY-MM-DD, o null se non ha una scadenza. */
  dueDate: string | null;
  /** Dove porta nell'area Studio, o null se e' solo un promemoria. */
  link: string | null;
}

export interface AgendaEntry extends AgendaItem {
  /** "scaduto" | "oggi" | "domani" | "settimana" | "piu_avanti" | "senza_data" */
  when: "scaduto" | "oggi" | "domani" | "settimana" | "piu_avanti" | "senza_data";
  /** Giorni da oggi alla scadenza (negativi se passata), o null. */
  daysLeft: number | null;
}

const DAY = 86_400_000;

function daysBetween(today: string, due: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

/**
 * Ordina e classifica: prima cio' che e' scaduto (il piu' vecchio in testa),
 * poi per data crescente, in fondo cio' che non ha scadenza. Una verifica in
 * calendario gia' passata non e' piu' una cosa da fare e viene tolta.
 */
export function buildAgenda(items: AgendaItem[], today: string): AgendaEntry[] {
  const entries: AgendaEntry[] = [];
  for (const item of items) {
    if (item.dueDate === null) {
      entries.push({ ...item, when: "senza_data", daysLeft: null });
      continue;
    }
    const daysLeft = daysBetween(today, item.dueDate);
    if (daysLeft < 0 && item.kind === "verifica") continue;
    const when =
      daysLeft < 0 ? "scaduto" : daysLeft === 0 ? "oggi" : daysLeft === 1 ? "domani" : daysLeft <= 7 ? "settimana" : "piu_avanti";
    entries.push({ ...item, when, daysLeft });
  }
  return entries.sort((a, b) => {
    if (a.dueDate === null || b.dueDate === null) {
      if (a.dueDate === b.dueDate) return a.title.localeCompare(b.title, "it");
      return a.dueDate === null ? 1 : -1;
    }
    return a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, "it");
  });
}
