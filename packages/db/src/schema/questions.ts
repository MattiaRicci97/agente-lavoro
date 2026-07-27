import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";

/**
 * Domande di richiamo attivo su un materiale.
 *
 * L'AI scrive la prima stesura, ma le domande restano del docente: le nuove
 * generazioni nascono come bozze, lui le riscrive, ne elimina o aggiunge di
 * sue, e approva. Solo le domande approvate arrivano agli studenti.
 */
export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull(),
  /**
   * "bozza" | "approvata". Il default è "approvata" per non far sparire le
   * domande già in uso: sono le nuove generazioni AI a nascere come bozze.
   */
  status: text("status").notNull().default("approvata"),
  /** "ai" | "docente": chi ha scritto la prima stesura. */
  authorType: text("author_type").notNull().default("ai"),
  /** true se il docente ne ha modificato il testo. */
  editedByTeacher: boolean("edited_by_teacher").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
