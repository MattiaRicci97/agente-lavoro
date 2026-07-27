import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { teachersTable } from "./teachers";

/**
 * Il compito assegnato dal docente alla classe: una sola traccia, valida per
 * tutti. Le risposte dei singoli studenti stanno in written_exam_submissions.
 *
 * Le colonne studentName/studentAnswer/grade/feedback appartengono alla
 * versione precedente, quando il compito e la consegna erano la stessa riga
 * (e un solo studente per classe poteva svolgerlo). Restano per non perdere
 * i dati gia' inseriti, ma non vengono piu' scritte.
 */
export const writtenExamsTable = pgTable("written_exams", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  examType: text("exam_type").notNull(),
  prompt: text("prompt").notNull(),
  /** Docente che ha assegnato il compito. */
  assignedByTeacherId: integer("assigned_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  /** Consegna entro (YYYY-MM-DD); null = senza scadenza. */
  dueDate: text("due_date"),
  /** Nota del docente alla classe, mostrata insieme alla traccia. */
  instructions: text("instructions"),
  studentName: text("student_name"),
  studentAnswer: text("student_answer"),
  grade: integer("grade"),
  feedback: text("feedback"),
  status: text("status").notNull().default("da_svolgere"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWrittenExamSchema = createInsertSchema(writtenExamsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWrittenExam = z.infer<typeof insertWrittenExamSchema>;
export type WrittenExam = typeof writtenExamsTable.$inferSelect;
