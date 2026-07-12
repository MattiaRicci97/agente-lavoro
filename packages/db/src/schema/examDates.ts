import { pgTable, serial, text, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { materialsTable } from "./materials";

/**
 * Verifiche/interrogazioni programmate dal docente per una classe.
 * Il piano di ripasso dello studente si organizza a ritroso da queste date.
 */
export const examDatesTable = pgTable("exam_dates", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materialsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExamDateSchema = createInsertSchema(examDatesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExamDate = z.infer<typeof insertExamDateSchema>;
export type ExamDate = typeof examDatesTable.$inferSelect;
