import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { teachersTable } from "./teachers";

/**
 * Le osservazioni che il docente annota su uno studente.
 *
 * Sono private: non le vede lo studente, non le vede un altro docente, e non
 * vengono mai passate all'assistente. Servono al docente per ricordarsi quello
 * che nota lavorando in classe — il pezzo di conoscenza che nessun dato
 * raccolto dalla piattaforma puo' sostituire.
 */
export const studentNotesTable = pgTable("student_notes", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudentNoteSchema = createInsertSchema(studentNotesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStudentNote = z.infer<typeof insertStudentNoteSchema>;
export type StudentNote = typeof studentNotesTable.$inferSelect;
