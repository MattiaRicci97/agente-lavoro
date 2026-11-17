import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { materialsTable } from "./materials";
import { studentsTable } from "./students";
import { classesTable } from "./classes";

/**
 * L'archivio del corso: ogni materiale (documento o trascrizione di lezione)
 * spezzato in passaggi su cui si puo' cercare. E' un indice derivato dal
 * contenuto dei materiali: si puo' sempre ricostruire da li'.
 */
export const courseChunksTable = pgTable("course_chunks", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  ord: integer("ord").notNull(),
  content: text("content").notNull(),
});

export interface StudyPlanStep {
  title: string;
  activity: string;
  minutes: number;
  /** Da dove viene: titoli dei materiali del corso su cui si basa il passo. */
  sources: Array<{ materialId: number; title: string }>;
}

export interface StudyPlanContent {
  title: string;
  summary: string;
  steps: StudyPlanStep[];
}

/** Un piano di ripasso preparato per uno studente su un argomento del corso. */
export const studyPlansTable = pgTable("study_plans", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  topic: text("topic").notNull(),
  plan: jsonb("plan").$type<StudyPlanContent>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourseChunk = typeof courseChunksTable.$inferSelect;
export type StudyPlan = typeof studyPlansTable.$inferSelect;
