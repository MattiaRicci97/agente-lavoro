import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { materialsTable } from "./materials";
import { classesTable } from "./classes";
import { teachersTable } from "./teachers";

/**
 * Correzione di un compito scritto a mano fotografato.
 *
 * L'AI produce una PROPOSTA di correzione (voto + feedback): non è una
 * valutazione ufficiale finché il docente non la esamina, eventualmente la
 * modifica e la firma. Fino ad allora lo studente vede il suggerimento
 * dell'assistente, non un voto del prof.
 */
export const photoCorrectionsTable = pgTable("photo_corrections", {
  id: serial("id").primaryKey(),
  authUserId: text("auth_user_id").notNull(),
  studentName: text("student_name").notNull(),
  // Classe dello studente: serve al docente per ritrovare le proposte da validare.
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull().default(""),
  // Materiale collegato (facoltativo): dà contesto alla correzione.
  materialId: integer("material_id").references(() => materialsTable.id, { onDelete: "set null" }),
  // Cosa chiedeva il compito (facoltativo, inserito dallo studente).
  assignmentPrompt: text("assignment_prompt"),
  imageObjectPath: text("image_object_path").notNull(),
  // Trascrizione di ciò che l'AI ha letto nella foto.
  transcription: text("transcription").notNull().default(""),

  // --- Proposta dell'assistente ---
  grade: integer("grade"),
  feedback: text("feedback").notNull().default(""),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  improvements: jsonb("improvements").$type<string[]>().notNull().default([]),

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

export type PhotoCorrection = typeof photoCorrectionsTable.$inferSelect;
