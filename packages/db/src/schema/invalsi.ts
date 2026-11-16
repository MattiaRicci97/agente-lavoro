import { pgTable, serial, text, timestamp, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { studentsTable } from "./students";
import { teachersTable } from "./teachers";

/**
 * Prove di allenamento in stile INVALSI: quesiti a risposta chiusa, corretti
 * in automatico. Non sono le prove ufficiali: i quesiti li propone
 * l'assistente, il docente li rilegge uno a uno e pubblica la prova. Finche'
 * e' in bozza gli studenti non la vedono.
 *
 * E' allenamento: il punteggio non e' un voto e non entra nel registro.
 */
export const invalsiTestsTable = pgTable("invalsi_tests", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
  /** "Italiano" | "Matematica" | "Inglese" */
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  title: text("title").notNull(),
  /** Testo da leggere a cui si riferiscono i quesiti (italiano e inglese); null per matematica. */
  passage: text("passage"),
  /** Tempo consigliato, in minuti. */
  minutes: integer("minutes").notNull().default(30),
  /** "bozza" | "pubblicata" */
  status: text("status").notNull().default("bozza"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invalsiItemsTable = pgTable("invalsi_items", {
  id: serial("id").primaryKey(),
  testId: integer("test_id")
    .notNull()
    .references(() => invalsiTestsTable.id, { onDelete: "cascade" }),
  ord: integer("ord").notNull().default(0),
  question: text("question").notNull(),
  /** Quattro alternative. */
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  /** Perche' quella e' la risposta giusta: lo studente la legge dopo la consegna. */
  explanation: text("explanation").notNull().default(""),
  /** Ambito del quesito (es. "Numeri", "Comprensione del testo"). */
  area: text("area").notNull().default(""),
  /** "ai" | "docente" */
  authorType: text("author_type").notNull().default("ai"),
});

/** Lo svolgimento di uno studente: uno solo per prova. */
export const invalsiAttemptsTable = pgTable(
  "invalsi_attempts",
  {
    id: serial("id").primaryKey(),
    testId: integer("test_id")
      .notNull()
      .references(() => invalsiTestsTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    /** Per ogni quesito (id) l'indice scelto, o null se lasciato in bianco. */
    answers: jsonb("answers").$type<Record<string, number | null>>().notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("invalsi_attempts_unique").on(t.testId, t.studentId)],
);

export type InvalsiTest = typeof invalsiTestsTable.$inferSelect;
export type InvalsiItem = typeof invalsiItemsTable.$inferSelect;
export type InvalsiAttempt = typeof invalsiAttemptsTable.$inferSelect;
