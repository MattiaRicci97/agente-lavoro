import { pgTable, serial, text, timestamp, integer, jsonb, date, primaryKey, unique } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { studentsTable } from "./students";
import { teachersTable } from "./teachers";
import { learningObjectivesTable } from "./learningObjectives";
import { writtenExamsTable } from "./writtenExams";

/**
 * Il recupero mirato dopo una verifica.
 *
 * Quando il docente firma le correzioni, Sillabo prepara UN set di recupero
 * per la classe: gli obiettivi su cui qualcuno ha sbagliato e, per ciascuno,
 * poche domande di richiamo. Il set nasce "bozza": le domande le propone
 * l'assistente, il docente le rilegge e approva. Solo allora ogni studente
 * riceve i richiami sui PROPRI obiettivi, ripresentati a intervalli crescenti.
 * Nessun recupero parte senza quell'approvazione.
 *
 * I richiami sono pratica: lo studente si autovaluta, il profilo si aggiorna,
 * nessun voto viene creato.
 */
export const recoverySetsTable = pgTable("recovery_sets", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  /** "scritto" (un compito assegnato) | "foto" (compiti fotografati) */
  sourceKind: text("source_kind").notNull(),
  examId: integer("exam_id").references(() => writtenExamsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  /** "bozza" | "approvato" */
  status: text("status").notNull().default("bozza"),
  /** Dopo quanti giorni dall'approvazione arriva ciascun richiamo. */
  intervalsDays: jsonb("intervals_days").$type<number[]>().notNull().default([2, 7, 21]),
  approvedByTeacherId: integer("approved_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /** Bozza della verifica di riscontro (proposta dell'assistente, testo del docente). */
  followupDraft: text("followup_draft"),
  /** La verifica di riscontro assegnata, che chiude il ciclo. */
  followupExamId: integer("followup_exam_id").references(() => writtenExamsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Le correzioni firmate da cui il set prende le diagnosi. */
export const recoverySetSourcesTable = pgTable(
  "recovery_set_sources",
  {
    recoverySetId: integer("recovery_set_id")
      .notNull()
      .references(() => recoverySetsTable.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    sourceId: integer("source_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.recoverySetId, t.sourceKind, t.sourceId] })],
);

/** Le domande di richiamo del set: bozza dell'assistente, testo del docente. */
export const recoveryQuestionsTable = pgTable("recovery_questions", {
  id: serial("id").primaryKey(),
  recoverySetId: integer("recovery_set_id")
    .notNull()
    .references(() => recoverySetsTable.id, { onDelete: "cascade" }),
  objectiveId: integer("objective_id")
    .notNull()
    .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  /** "ai" | "docente" */
  authorType: text("author_type").notNull().default("ai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Un richiamo per uno studente: un obiettivo, un giro, una data. */
export const recoveryItemsTable = pgTable("recovery_items", {
  id: serial("id").primaryKey(),
  recoverySetId: integer("recovery_set_id")
    .notNull()
    .references(() => recoverySetsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  objectiveId: integer("objective_id")
    .notNull()
    .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").references(() => recoveryQuestionsTable.id, { onDelete: "set null" }),
  /** 1, 2, 3...: quale intervallo. */
  round: integer("round").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  /** "da_fare" | "fatto" */
  status: text("status").notNull().default("da_fare"),
  /** Autovalutazione dello studente: "corretto" | "errato". */
  result: text("result"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Avvisi personali nell'area Studio (non sono post di bacheca: riguardano un solo studente). */
export const studentNoticesTable = pgTable("student_notices", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecoverySet = typeof recoverySetsTable.$inferSelect;
export type RecoveryQuestion = typeof recoveryQuestionsTable.$inferSelect;
export type RecoveryItem = typeof recoveryItemsTable.$inferSelect;
export type StudentNotice = typeof studentNoticesTable.$inferSelect;

/**
 * Bozza di un'attivita' breve da fare in classe per riprendere un obiettivo.
 * L'assistente scrive la prima stesura (ai_draft), il docente la fa sua (body):
 * resta uno strumento del docente, agli studenti non arriva nulla da qui.
 */
export const recoveryActivitiesTable = pgTable(
  "recovery_activities",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
    aiDraft: text("ai_draft").notNull().default(""),
    body: text("body").notNull().default(""),
    updatedByTeacherId: integer("updated_by_teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("recovery_activities_unique").on(t.classId, t.objectiveId)],
);
export type RecoveryActivity = typeof recoveryActivitiesTable.$inferSelect;
