import { OBJECTIVES_MATEMATICA_BIENNIO, type SeedObjectiveGroup } from "./objectivesMatematicaBiennio";
import { OBJECTIVES_MATEMATICA_TRIENNIO } from "./objectivesMatematicaTriennio";
import { OBJECTIVES_ITALIANO_BIENNIO } from "./objectivesItalianoBiennio";
import { OBJECTIVES_INGLESE_BIENNIO } from "./objectivesIngleseBiennio";
import { OBJECTIVES_FISICA_BIENNIO } from "./objectivesFisicaBiennio";

/**
 * Tutto il catalogo base degli obiettivi, nell'ordine in cui va caricato:
 * dentro una materia gli anni precedenti vengono prima, perche' un obiettivo
 * puo' richiederne uno di un anno precedente.
 */
export const OBJECTIVE_CATALOG: SeedObjectiveGroup[] = [
  ...OBJECTIVES_MATEMATICA_BIENNIO,
  ...OBJECTIVES_MATEMATICA_TRIENNIO,
  ...OBJECTIVES_ITALIANO_BIENNIO,
  ...OBJECTIVES_INGLESE_BIENNIO,
  ...OBJECTIVES_FISICA_BIENNIO,
];

/**
 * Controlla che il catalogo sia coerente prima di caricarlo. Restituisce
 * l'elenco dei problemi (vuoto se tutto e' a posto):
 * - codici ripetuti nella stessa materia;
 * - prerequisiti che non esistono nella stessa materia;
 * - prerequisiti che puntano a un obiettivo caricato dopo (anno successivo,
 *   o piu' avanti nello stesso anno): oltre a essere didatticamente strani,
 *   renderebbero possibili i cicli.
 */
export function validateObjectiveCatalog(groups: SeedObjectiveGroup[]): string[] {
  const problems: string[] = [];
  const seenBySubject = new Map<string, Set<string>>();
  for (const group of groups) {
    const seen = seenBySubject.get(group.subject) ?? new Set<string>();
    seenBySubject.set(group.subject, seen);
    for (const o of group.objectives) {
      if (seen.has(o.code)) problems.push(`${group.subject}: il codice ${o.code} compare due volte`);
      for (const req of o.requires ?? []) {
        if (req === o.code) problems.push(`${o.code} richiede se stesso`);
        else if (!seen.has(req)) problems.push(`${o.code} richiede ${req}, che non esiste prima di lui in ${group.subject}`);
      }
      if (!o.title.trim() || !o.description.trim()) problems.push(`${o.code}: titolo o descrizione mancante`);
      seen.add(o.code);
    }
  }
  return problems;
}
