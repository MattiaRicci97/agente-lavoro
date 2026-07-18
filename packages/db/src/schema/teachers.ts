import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface TeachingPlace {
  /** Nome dell'istituto o dell'università dove il docente insegna. */
  name: string;
  /** Tipologia contrattuale per quella sede (testo libero). */
  contract: string;
}

export const teachersTable = pgTable("teachers", {
  id: serial("id").primaryKey(),
  authUserId: text("auth_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  /** Titolo (es. Prof., Prof.ssa, Dott., Dott.ssa). */
  title: text("title"),
  /** Materie insegnate. */
  subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
  /** Istituti/università dove il docente insegna, con contratto per ciascuno. */
  teachingPlaces: jsonb("teaching_places").$type<TeachingPlace[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTeacherSchema = createInsertSchema(teachersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type Teacher = typeof teachersTable.$inferSelect;
