import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { teachersTable } from "./teachers";

/**
 * Il consiglio di classe: i docenti che lavorano su una classe.
 *
 * Fino a qui una classe apparteneva a un docente (classes.teacher_id), il che
 * costringeva i colleghi a creare ciascuno la "propria" 4C, con codici di
 * iscrizione diversi e studenti iscritti piu' volte. Nella scuola vera la
 * classe e' della scuola: ci lavorano dieci docenti, ognuno con la sua materia.
 *
 * Il coordinatore gestisce l'organico della classe; tutti gli altri insegnano
 * con gli stessi poteri (materiali, compiti, bacheca, registro).
 */
export const classTeachersTable = pgTable(
  "class_teachers",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => teachersTable.id, { onDelete: "cascade" }),
    /** Materia insegnata in questa classe. */
    subject: text("subject").notNull().default(""),
    /** "coordinatore" | "docente" */
    role: text("role").notNull().default("docente"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("class_teachers_unique").on(t.classId, t.teacherId)],
);

export const insertClassTeacherSchema = createInsertSchema(classTeachersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClassTeacher = z.infer<typeof insertClassTeacherSchema>;
export type ClassTeacher = typeof classTeachersTable.$inferSelect;
