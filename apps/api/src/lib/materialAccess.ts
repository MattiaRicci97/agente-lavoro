import { eq, and, or, inArray, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  db,
  materialsTable,
  materialClassesTable,
  classTeachersTable,
  studentsTable,
  teachersTable,
} from "@sillabo/db";
import type { Request } from "express";
import { teacherClassIds } from "./classAccess";

/**
 * Chi vede quali materiali.
 *
 * Un materiale appartiene a chi lo ha caricato e viaggia verso gli studenti
 * solo attraverso le classi a cui il docente lo assegna. Senza questo filtro
 * ogni utente vedrebbe l'archivio di tutte le scuole sulla piattaforma.
 *
 *  - docente: i materiali che ha caricato, piu' quelli assegnati alle sue classi
 *    (utile quando piu' docenti lavorano sulla stessa classe);
 *  - studente: solo i materiali assegnati alle classi in cui e' iscritto.
 */

/** Classi in cui lo studente autenticato risulta iscritto. */
async function studentClassIds(authUserId: string): Promise<number[]> {
  const rows = await db
    .select({ classId: studentsTable.classId })
    .from(studentsTable)
    .where(eq(studentsTable.authUserId, authUserId));
  return rows.map((r) => r.classId);
}

/** Materiali assegnati ad almeno una delle classi indicate. */
async function materialIdsForClasses(classIds: number[]): Promise<number[]> {
  if (!classIds.length) return [];
  const rows = await db
    .selectDistinct({ materialId: materialClassesTable.materialId })
    .from(materialClassesTable)
    .where(inArray(materialClassesTable.classId, classIds));
  return rows.map((r) => r.materialId);
}

/**
 * Condizione SQL da applicare alle query sui materiali per l'utente della
 * richiesta. Restituisce `null` quando l'utente non puo' vedere nulla:
 * in quel caso chi chiama deve rispondere con una lista vuota.
 */
export async function materialVisibilityFilter(req: Request): Promise<SQL | null> {
  // requireAuth non popola req.teacher: sulle rotte condivise fra docenti e
  // studenti il ruolo va ricavato qui.
  let teacherId = req.teacher?.id;
  if (teacherId === undefined) {
    const [row] = await db
      .select({ id: teachersTable.id })
      .from(teachersTable)
      .where(eq(teachersTable.authUserId, req.authUserId!));
    teacherId = row?.id;
  }

  if (teacherId !== undefined) {
    const ids = await materialIdsForClasses(await teacherClassIds(teacherId));
    const own = eq(materialsTable.teacherId, teacherId);
    return ids.length ? or(own, inArray(materialsTable.id, ids))! : own;
  }

  const ids = await materialIdsForClasses(await studentClassIds(req.authUserId!));
  return ids.length ? inArray(materialsTable.id, ids) : null;
}

/**
 * Il docente puo' gestire (modificare, cancellare, vedere le statistiche di)
 * un materiale se lo ha caricato lui o se e' assegnato a una sua classe.
 * I materiali senza autore, caricati prima dell'introduzione della proprieta',
 * restano gestibili da chi ha la classe collegata.
 */
export async function teacherCanManageMaterial(teacherId: number, materialId: number): Promise<boolean> {
  const [material] = await db
    .select({ teacherId: materialsTable.teacherId })
    .from(materialsTable)
    .where(eq(materialsTable.id, materialId));
  if (!material) return false;
  if (material.teacherId === teacherId) return true;

  const [linked] = await db
    .select({ classId: materialClassesTable.classId })
    .from(materialClassesTable)
    .innerJoin(classTeachersTable, eq(classTeachersTable.classId, materialClassesTable.classId))
    .where(and(eq(materialClassesTable.materialId, materialId), eq(classTeachersTable.teacherId, teacherId)));

  return !!linked;
}

/** Materiali visibili al docente, per le viste aggregate (statistiche). */
export async function teacherMaterialIds(teacherId: number): Promise<number[]> {
  const rows = await db
    .select({ id: materialsTable.id })
    .from(materialsTable)
    .where(eq(materialsTable.teacherId, teacherId));
  const linked = await materialIdsForClasses(await teacherClassIds(teacherId));
  return Array.from(new Set([...rows.map((r) => r.id), ...linked]));
}

/** Materiali rimasti senza autore: usati solo dallo script di backfill. */
export const orphanMaterialsCondition = isNull(materialsTable.teacherId);
