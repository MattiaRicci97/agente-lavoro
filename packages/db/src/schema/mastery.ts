import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { learningObjectivesTable } from "./learningObjectives";

/**
 * Il profilo di padronanza: per ogni studente e obiettivo, a che punto siamo.
 *
 * mastery_events e' il registro delle evidenze, con la fonte sempre esplicita:
 *  - "firmato": un esercizio di una verifica che il docente ha validato;
 *  - "pratica": un quiz corretto dall'assistente;
 *  - "autovalutazione": un richiamo Lampo in cui lo studente dice com'e' andata.
 *
 * mastery_states e' la sintesi, ricalcolata dagli eventi e mai scritta a mano.
 * Solo l'evidenza firmata puo' portare un obiettivo ad "acquisito": la pratica
 * aggiorna il quadro ma non certifica nulla, e non entra mai nel registro
 * (che legge altre tabelle: qui non c'e' nessun voto).
 *
 * L'etichetta sta sull'obiettivo, non sulla persona: niente punteggi
 * complessivi, niente previsioni.
 */
export type MasterySource = "firmato" | "pratica" | "autovalutazione";
export type MasteryOutcome = "corretto" | "parziale" | "errato";
export type MasteryState = "acquisito" | "fragile" | "mancante";

export const masteryEventsTable = pgTable("mastery_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  objectiveId: integer("objective_id")
    .notNull()
    .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
  source: text("source").notNull().$type<MasterySource>(),
  outcome: text("outcome").notNull().$type<MasteryOutcome>(),
  /** Da dove viene l'evidenza: "scritto" | "foto" | "quiz" | "recupero". */
  sourceKind: text("source_kind").notNull(),
  sourceId: integer("source_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const masteryStatesTable = pgTable(
  "mastery_states",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
    /** null = solo pratica: l'obiettivo non e' ancora stato verificato da un docente. */
    state: text("state").$type<MasteryState>(),
    signedCorrect: integer("signed_correct").notNull().default(0),
    signedTotal: integer("signed_total").notNull().default(0),
    practiceCorrect: integer("practice_correct").notNull().default(0),
    practiceTotal: integer("practice_total").notNull().default(0),
    lastSignedAt: timestamp("last_signed_at", { withTimezone: true }),
    lastPracticeAt: timestamp("last_practice_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mastery_states_unique").on(t.studentId, t.objectiveId)],
);

export type MasteryEvent = typeof masteryEventsTable.$inferSelect;
export type MasteryStateRow = typeof masteryStatesTable.$inferSelect;
