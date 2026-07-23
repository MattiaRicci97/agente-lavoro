import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { materialsTable } from "./materials";

/**
 * Correzione di un compito scritto a mano fotografato: lo studente carica
 * una foto, l'AI (visione di Claude) la legge, la corregge e assegna un voto.
 */
export const photoCorrectionsTable = pgTable("photo_corrections", {
  id: serial("id").primaryKey(),
  authUserId: text("auth_user_id").notNull(),
  studentName: text("student_name").notNull(),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull().default(""),
  // Materiale collegato (facoltativo): dà contesto alla correzione.
  materialId: integer("material_id").references(() => materialsTable.id, { onDelete: "set null" }),
  // Cosa chiedeva il compito (facoltativo, inserito dallo studente).
  assignmentPrompt: text("assignment_prompt"),
  imageObjectPath: text("image_object_path").notNull(),
  // Trascrizione di ciò che l'AI ha letto nella foto.
  transcription: text("transcription").notNull().default(""),
  grade: integer("grade"),
  feedback: text("feedback").notNull().default(""),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  improvements: jsonb("improvements").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PhotoCorrection = typeof photoCorrectionsTable.$inferSelect;
