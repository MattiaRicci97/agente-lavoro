import { pgTable, serial, text, timestamp, integer, jsonb, primaryKey, unique } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { studentsTable } from "./students";
import { teachersTable } from "./teachers";
import { materialsTable } from "./materials";
import { learningObjectivesTable } from "./learningObjectives";

/**
 * L'attivita' guidata: il docente sceglie un argomento, i materiali su cui
 * lavorare e (se vuole) gli obiettivi della mappa. Ogni studente la svolge
 * in una chat in cui l'assistente guida con domande, restando dentro quei
 * materiali. La conversazione non viene conservata.
 *
 * Al docente torna solo un riepilogo della classe: quanti l'hanno svolta e,
 * per obiettivo, dove si e' faticato. E' pratica: non produce voti e non
 * tocca il profilo di padronanza.
 */
export const guidedActivitiesTable = pgTable("guided_activities", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  title: text("title").notNull(),
  /** La consegna del docente: su cosa lavorare e a che scopo. */
  brief: text("brief").notNull(),
  /** Entro quando (YYYY-MM-DD); null = senza scadenza. */
  dueDate: text("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** I materiali dentro cui l'assistente puo' cercare per questa attivita'. */
export const guidedActivityMaterialsTable = pgTable(
  "guided_activity_materials",
  {
    activityId: integer("activity_id")
      .notNull()
      .references(() => guidedActivitiesTable.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.materialId] })],
);

/** Gli obiettivi della mappa che l'attivita' allena (facoltativi). */
export const guidedActivityObjectivesTable = pgTable(
  "guided_activity_objectives",
  {
    activityId: integer("activity_id")
      .notNull()
      .references(() => guidedActivitiesTable.id, { onDelete: "cascade" }),
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.objectiveId] })],
);

export type GuidedSignalLevel = "sicuro" | "incerto";

/**
 * Lo svolgimento di uno studente. Non contiene la conversazione: solo quanti
 * scambi ha fatto e, alla chiusura, i segnali per obiettivo e i punti in cui
 * si e' bloccato, descritti come concetti. Servono al riepilogo di classe e
 * non vengono mai mostrati per singolo studente.
 */
export const guidedActivitySessionsTable = pgTable(
  "guided_activity_sessions",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => guidedActivitiesTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    turns: integer("turns").notNull().default(0),
    signals: jsonb("signals").$type<Array<{ objectiveId: number; level: GuidedSignalLevel }>>().notNull().default([]),
    stuckPoints: jsonb("stuck_points").$type<string[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("guided_activity_sessions_unique").on(t.activityId, t.studentId)],
);

export type GuidedActivity = typeof guidedActivitiesTable.$inferSelect;
export type GuidedActivitySession = typeof guidedActivitySessionsTable.$inferSelect;
