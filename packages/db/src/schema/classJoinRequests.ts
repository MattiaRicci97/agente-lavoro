import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { studentsTable } from "./students";

export const classJoinRequestsTable = pgTable("class_join_requests", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  authUserId: text("auth_user_id").notNull(),
  studentName: text("student_name").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  studentId: integer("student_id").references(() => studentsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertClassJoinRequestSchema = createInsertSchema(classJoinRequestsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClassJoinRequest = z.infer<typeof insertClassJoinRequestSchema>;
export type ClassJoinRequest = typeof classJoinRequestsTable.$inferSelect;
