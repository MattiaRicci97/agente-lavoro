import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { classesTable } from "./classes";
import { teachersTable } from "./teachers";
import { learningObjectivesTable } from "./learningObjectives";

/**
 * La diagnosi di una correzione: esercizio per esercizio, QUALE obiettivo era
 * in gioco e COME e' andata.
 *
 * Il voto dice quanto; la diagnosi dice dove. E' il pezzo che rende una
 * verifica riutilizzabile: senza, un 5 e' solo un 5; con, e' "le equazioni
 * fratte sono fragili, il resto tiene".
 *
 * Stesso patto del voto: l'assistente propone (colonne ai_*), il docente
 * dispone (colonne senza prefisso). Finche' lo stato e' "da_validare" lo
 * studente non vede nulla; "scartata" significa che il docente ha giudicato
 * la riga sbagliata o inutile, e non contera' per nessun profilo.
 *
 * Le etichette restano sull'esercizio e sull'obiettivo, mai sulla persona.
 */
export type DiagnosisOutcome = "corretto" | "parziale" | "errato";
export type DiagnosisErrorType = "concettuale" | "procedurale" | "distrazione" | "non_classificato";

export const diagnosisItemsTable = pgTable("diagnosis_items", {
  id: serial("id").primaryKey(),
  /** "scritto" (written_exam_submissions) | "foto" (photo_corrections) */
  sourceKind: text("source_kind").notNull(),
  sourceId: integer("source_id").notNull(),
  studentId: integer("student_id").references(() => studentsTable.id, { onDelete: "cascade" }),
  authUserId: text("auth_user_id").notNull(),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "set null" }),
  /** Come il modello ha chiamato l'esercizio: "Es. 3", "Seconda domanda"... */
  exerciseLabel: text("exercise_label").notNull(),
  /** Ordine di presentazione dentro la stessa correzione. */
  ord: integer("ord").notNull().default(0),

  // --- Proposta dell'assistente ---
  aiObjectiveId: integer("ai_objective_id").references(() => learningObjectivesTable.id, { onDelete: "set null" }),
  aiOutcome: text("ai_outcome").notNull().$type<DiagnosisOutcome>(),
  aiErrorType: text("ai_error_type").$type<DiagnosisErrorType>(),
  /** Frase breve presa dalla risposta dello studente che giustifica la lettura. */
  aiEvidence: text("ai_evidence").notNull().default(""),

  // --- Decisione del docente (valorizzata alla firma) ---
  objectiveId: integer("objective_id").references(() => learningObjectivesTable.id, { onDelete: "set null" }),
  outcome: text("outcome").$type<DiagnosisOutcome>(),
  errorType: text("error_type").$type<DiagnosisErrorType>(),
  /** "da_validare" | "validata" | "scartata" */
  status: text("status").notNull().default("da_validare"),
  validatedByTeacherId: integer("validated_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiagnosisItem = typeof diagnosisItemsTable.$inferSelect;
export type InsertDiagnosisItem = typeof diagnosisItemsTable.$inferInsert;
