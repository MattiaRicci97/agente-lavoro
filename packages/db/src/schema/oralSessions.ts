import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { teachersTable } from "./teachers";

/**
 * Simulazione di interrogazione orale.
 *
 * Voto e feedback prodotti dall'AI sono una PROPOSTA di valutazione: diventano
 * ufficiali solo dopo il visto del docente, che può confermarli o modificarli.
 */
export const oralSessionsTable = pgTable("oral_sessions", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  status: text("status").notNull().default("in_corso"),
  // --- Proposta dell'assistente ---
  grade: integer("grade"),
  feedback: text("feedback"),
  // --- Visto del docente ---
  /** "da_validare" | "validata" */
  validationStatus: text("validation_status").notNull().default("da_validare"),
  teacherGrade: integer("teacher_grade"),
  teacherFeedback: text("teacher_feedback"),
  validatedByTeacherId: integer("validated_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOralSessionSchema = createInsertSchema(oralSessionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOralSession = z.infer<typeof insertOralSessionSchema>;
export type OralSession = typeof oralSessionsTable.$inferSelect;
