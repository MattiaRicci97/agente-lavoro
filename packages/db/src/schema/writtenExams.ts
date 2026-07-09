import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";

export const writtenExamsTable = pgTable("written_exams", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  examType: text("exam_type").notNull(),
  prompt: text("prompt").notNull(),
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
