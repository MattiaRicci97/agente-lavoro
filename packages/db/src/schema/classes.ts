import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { institutionsTable } from "./institutions";
import { teachersTable } from "./teachers";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutionsTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  gradeLevel: text("grade_level").notNull(),
  teacherName: text("teacher_name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClassSchema = createInsertSchema(classesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classesTable.$inferSelect;
