import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { oralSessionsTable } from "./oralSessions";

export const oralMessagesTable = pgTable("oral_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => oralSessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOralMessageSchema = createInsertSchema(oralMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOralMessage = z.infer<typeof insertOralMessageSchema>;
export type OralMessage = typeof oralMessagesTable.$inferSelect;
