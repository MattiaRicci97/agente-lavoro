import { pgTable, serial, text, timestamp, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { studentsTable } from "./students";
import { teachersTable } from "./teachers";

/**
 * Lo scrutinio: il consiglio di classe che si presenta gia' istruito.
 *
 * Tre volte l'anno il consiglio passa ore a ricostruire a memoria com'e' andato
 * ogni studente, materia per materia. Ma quei dati Sillabo li ha gia': sono i
 * voti che i docenti hanno firmato durante l'anno. Qui vengono raccolti in un
 * fascicolo per alunno, con una bozza di giudizio scritta sull'evidenza.
 *
 * Due limiti sono deliberati, non mancanze:
 *
 *  - Sillabo NON propone l'ammissione o la non ammissione. Quella e' una
 *    decisione del consiglio, con valore legale, e non spetta a un software.
 *    Qui si prepara il giudizio descrittivo, non l'esito.
 *  - Le osservazioni private dei docenti sui singoli studenti non entrano mai
 *    nella bozza: restano quello che sono, appunti personali.
 *
 * Il giudizio diventa definitivo solo quando un docente lo approva.
 */
export const scrutiniTable = pgTable("scrutini", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  /** Es. "Primo quadrimestre". */
  label: text("label").notNull(),
  /** Periodo considerato (YYYY-MM-DD); null = tutto. */
  periodFrom: text("period_from"),
  periodTo: text("period_to"),
  /** "aperto" | "chiuso" */
  status: text("status").notNull().default("aperto"),
  createdByTeacherId: integer("created_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Il fascicolo di un singolo studente dentro uno scrutinio. */
export interface ScrutinioSummary {
  /** Media per materia, calcolata sui soli voti firmati nel periodo. */
  bySubject: Array<{ subject: string; average: number; count: number }>;
  overallAverage: number | null;
  gradesCount: number;
  /** Primo e ultimo voto del periodo: dice se sta salendo o scendendo. */
  trend: { first: number; last: number } | null;
  /** Esercitazione autonoma: impegno, non valutazione. */
  practice: { attempts: number; accuracyPercent: number | null };
}

export const scrutinioEntriesTable = pgTable(
  "scrutinio_entries",
  {
    id: serial("id").primaryKey(),
    scrutinioId: integer("scrutinio_id")
      .notNull()
      .references(() => scrutiniTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    /** Nome congelato al momento dello scrutinio. */
    studentName: text("student_name").notNull(),
    /** Fotografia dei numeri al momento della preparazione. */
    summary: jsonb("summary").$type<ScrutinioSummary>().notNull(),
    /** Bozza dell'assistente: resta accanto al testo del docente, non lo sostituisce. */
    aiDraft: text("ai_draft").notNull().default(""),
    /** Il giudizio del consiglio: e' questo che vale. */
    giudizio: text("giudizio").notNull().default(""),
    /** "bozza" | "approvato" */
    status: text("status").notNull().default("bozza"),
    approvedByTeacherId: integer("approved_by_teacher_id").references(() => teachersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("scrutinio_entries_unique").on(t.scrutinioId, t.studentId)],
);

export const insertScrutinioSchema = createInsertSchema(scrutiniTable).omit({ id: true, createdAt: true });
export type InsertScrutinio = z.infer<typeof insertScrutinioSchema>;
export type Scrutinio = typeof scrutiniTable.$inferSelect;
export type ScrutinioEntry = typeof scrutinioEntriesTable.$inferSelect;
