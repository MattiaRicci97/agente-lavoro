import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { teachersTable } from "./teachers";

/** Un criterio della griglia di valutazione: il peso e' in percentuale. */
export interface RubricCriterion {
  name: string;
  description: string;
  weight: number;
}

/** Il punteggio (1-10) su un criterio, con una nota breve. */
export interface RubricScore {
  criterion: string;
  score: number;
  note: string;
}

/**
 * Il compito assegnato dal docente alla classe: una sola traccia, valida per
 * tutti. Le risposte dei singoli studenti stanno in written_exam_submissions.
 *
 * Le colonne studentName/studentAnswer/grade/feedback appartengono alla
 * versione precedente, quando il compito e la consegna erano la stessa riga
 * (e un solo studente per classe poteva svolgerlo). Restano per non perdere
 * i dati gia' inseriti, ma non vengono piu' scritte.
 */
export const writtenExamsTable = pgTable("written_exams", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  examType: text("exam_type").notNull(),
  prompt: text("prompt").notNull(),
  /** Docente che ha assegnato il compito. */
  assignedByTeacherId: integer("assigned_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  /** Consegna entro (YYYY-MM-DD); null = senza scadenza. */
  dueDate: text("due_date"),
  /** Nota del docente alla classe, mostrata insieme alla traccia. */
  instructions: text("instructions"),
  /**
   * Valorizzato solo per una verifica di riscontro: il set di recupero che
   * chiude. La vedono solo gli studenti che hanno ricevuto quel recupero.
   */
  recoverySetId: integer("recovery_set_id"),
  /** Griglia di valutazione (null = il compito non ne ha una). */
  rubric: jsonb("rubric").$type<RubricCriterion[]>(),
  /**
   * "bozza" | "approvata". Solo la griglia approvata dal docente arriva agli
   * studenti e viene usata nella correzione.
   */
  rubricStatus: text("rubric_status").notNull().default("bozza"),
  studentName: text("student_name"),
  studentAnswer: text("student_answer"),
  grade: integer("grade"),
  feedback: text("feedback"),
  status: text("status").notNull().default("da_svolgere"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWrittenExamSchema = createInsertSchema(writtenExamsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWrittenExam = z.infer<typeof insertWrittenExamSchema>;
export type WrittenExam = typeof writtenExamsTable.$inferSelect;
