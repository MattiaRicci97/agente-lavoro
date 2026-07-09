import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";

export interface GradedAnswerRecord {
  questionId: number;
  question: string;
  topic: string;
  answerText: string;
  correct: boolean;
  feedback: string;
}

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  gradedAnswers: jsonb("graded_answers").$type<GradedAnswerRecord[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuizAttemptSchema = createInsertSchema(quizAttemptsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;
export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
