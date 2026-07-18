import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";

export const oralSessionsTable = pgTable("oral_sessions", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  status: text("status").notNull().default("in_corso"),
  grade: integer("grade"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOralSessionSchema = createInsertSchema(oralSessionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOralSession = z.infer<typeof insertOralSessionSchema>;
export type OralSession = typeof oralSessionsTable.$inferSelect;
