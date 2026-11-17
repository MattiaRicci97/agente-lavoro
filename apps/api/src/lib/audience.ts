import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, classesTable, studentsTable, teachersTable, institutionsTable } from "@sillabo/db";
import { teacherInstitutionIds } from "./objectives";
import { resolveProfile, type InstitutionKind } from "./institutionProfile";

/**
 * Per chi scrive l'assistente. Lo stesso Sillabo serve una scuola superiore,
 * un'universita' e una business school: l'assistente deve parlare al livello
 * giusto (registro, esempi, parole) senza che ogni funzione lo sappia.
 *
 * Ogni richiesta porta con se' chi la fa; quando l'assistente viene chiamato,
 * il tipo d'istituto si ricava una volta sola e adatta le istruzioni. Al
 * modello non va nessun dato della persona: solo il tipo d'istituto.
 */
interface AudienceStore {
  req: Request;
  kind?: Promise<InstitutionKind>;
}

const storage = new AsyncLocalStorage<AudienceStore>();

/** Middleware: rende disponibile la richiesta corrente a chi chiama l'assistente. */
export function audienceContext(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ req }, () => next());
}

/** Gli istituti di chi chiama: come docente (membro o tramite classi) e come studente. */
export async function institutionIdsFor(authUserId: string): Promise<number[]> {
  const ids = new Set<number>();
  const [teacher] = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.authUserId, authUserId));
  if (teacher) for (const id of await teacherInstitutionIds(teacher.id)) ids.add(id);
  const asStudent = await db
    .select({ institutionId: classesTable.institutionId })
    .from(studentsTable)
    .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
    .where(eq(studentsTable.authUserId, authUserId));
  for (const r of asStudent) ids.add(r.institutionId);
  return Array.from(ids);
}

async function resolveKind(authUserId: string | undefined): Promise<InstitutionKind> {
  if (!authUserId) return "scuola";
  const ids = await institutionIdsFor(authUserId);
  if (!ids.length) return "scuola";
  const rows = await db.select({ kind: institutionsTable.kind }).from(institutionsTable).where(inArray(institutionsTable.id, ids));
  return resolveProfile(rows.map((r) => r.kind)).kind;
}

/** Il tipo d'istituto di chi sta usando l'assistente; fuori da una richiesta, la scuola. */
export async function currentAudience(): Promise<InstitutionKind> {
  const store = storage.getStore();
  if (!store) return "scuola";
  if (!store.kind) {
    store.kind = resolveKind((store.req as Request & { authUserId?: string }).authUserId).catch(() => "scuola" as const);
  }
  return store.kind;
}

const AUDIENCE_NOTE: Record<Exclude<InstitutionKind, "scuola">, string> = {
  universita:
    "\n\nCONTESTO: corso universitario italiano. Chi studia e' adulto: usa un registro accademico e il lessico " +
    "disciplinare preciso, con esempi e livello di approfondimento da corso di laurea, senza il tono da scuola " +
    "superiore. Parla di corso, lezioni ed esame; non di classe, registro, scrutinio o prove nazionali. " +
    "Se nel resto delle istruzioni compaiono 'classe' o 'scuola', intendi il corso e l'ateneo.",
  business_school:
    "\n\nCONTESTO: corso di una business school (master o formazione executive). Chi segue il corso e' un " +
    "professionista adulto: scrivi in modo concreto e professionale, con esempi tratti da casi aziendali e " +
    "dall'applicazione pratica. Chiama chi segue il corso 'partecipante'. Parla di corso, sessioni e " +
    "valutazione; non di classe, registro, scrutinio o prove nazionali. Se nel resto delle istruzioni " +
    "compaiono 'classe' o 'scuola', intendi il corso e la business school.",
};

/**
 * Le istruzioni del modello adattate a chi le usa. Per la scuola restano come
 * sono; altrimenti il ruolo di chi scrive cambia e si aggiunge il contesto.
 */
export function adaptSystemPrompt(system: string, kind: InstitutionKind): string {
  if (kind === "scuola") return system;
  const role = kind === "universita" ? "docente universitario italiano" : "docente di una business school italiana";
  const adapted = system
    .replace(/docente italiano di scuola superiore/g, role)
    .replace(/per la scuola superiore/g, kind === "universita" ? "per l'universita'" : "per la business school");
  return adapted + AUDIENCE_NOTE[kind];
}
