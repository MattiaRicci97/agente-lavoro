import { eq, and, inArray } from "drizzle-orm";
import { db, classTeachersTable, classesTable, studentsTable } from "@sillabo/db";

/**
 * Chi puo' lavorare su una classe.
 *
 * Da quando esiste il consiglio di classe, la risposta non e' piu' "chi l'ha
 * creata" ma "chi ne fa parte": l'appartenenza sta in class_teachers, e ogni
 * controllo di accesso alle classi passa da qui.
 */

/** Le classi in cui il docente insegna. */
export async function teacherClassIds(teacherId: number): Promise<number[]> {
  const rows = await db
    .select({ classId: classTeachersTable.classId })
    .from(classTeachersTable)
    .where(eq(classTeachersTable.teacherId, teacherId));
  return rows.map((r) => r.classId);
}

/** true se il docente fa parte del consiglio di questa classe. */
export async function isClassTeacher(teacherId: number, classId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: classTeachersTable.id })
    .from(classTeachersTable)
    .where(and(eq(classTeachersTable.teacherId, teacherId), eq(classTeachersTable.classId, classId)));
  return !!row;
}

/** true se il docente coordina questa classe (gestisce l'organico). */
export async function isCoordinator(teacherId: number, classId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: classTeachersTable.id })
    .from(classTeachersTable)
    .where(
      and(
        eq(classTeachersTable.teacherId, teacherId),
        eq(classTeachersTable.classId, classId),
        eq(classTeachersTable.role, "coordinatore"),
      ),
    );
  return !!row;
}

/** La classe, solo se il docente ne fa parte. */
export async function classForTeacher(teacherId: number, classId: number) {
  const [cls] = await db
    .select()
    .from(classesTable)
    .innerJoin(classTeachersTable, eq(classTeachersTable.classId, classesTable.id))
    .where(and(eq(classesTable.id, classId), eq(classTeachersTable.teacherId, teacherId)));
  return cls?.classes ?? null;
}

/**
 * Le classi in cui lo studente e' iscritto. Serve alle rotte condivise fra
 * docenti e studenti (elenco alunni, bacheca) per capire chi sta guardando.
 */
export async function studentClassIds(authUserId: string): Promise<number[]> {
  const rows = await db
    .select({ classId: studentsTable.classId })
    .from(studentsTable)
    .where(eq(studentsTable.authUserId, authUserId));
  return rows.map((r) => r.classId);
}

/** Le classi visibili all'utente, qualunque sia il suo ruolo. */
export async function visibleClassIds(opts: {
  teacherId?: number;
  authUserId: string;
}): Promise<number[]> {
  if (opts.teacherId !== undefined) return teacherClassIds(opts.teacherId);
  return studentClassIds(opts.authUserId);
}

/** I docenti del consiglio, con materia e ruolo. */
export async function classCouncil(classIds: number[]) {
  if (!classIds.length) return [];
  return db
    .select({
      id: classTeachersTable.id,
      classId: classTeachersTable.classId,
      teacherId: classTeachersTable.teacherId,
      subject: classTeachersTable.subject,
      role: classTeachersTable.role,
    })
    .from(classTeachersTable)
    .where(inArray(classTeachersTable.classId, classIds))
    .orderBy(classTeachersTable.id);
}
