import { pgTable, serial, text, timestamp, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";

/**
 * Lezioni dei moduli della super-app (es. educazione finanziaria).
 * I contenuti vengono caricati dal seed (`pnpm db:setup`) e sono uguali per
 * tutti gli istituti; l'attivazione per istituto passa da institution_modules.
 */
export const moduleLessonsTable = pgTable(
  "module_lessons",
  {
    id: serial("id").primaryKey(),
    moduleKey: text("module_key").notNull(),
    ord: integer("ord").notNull(),
    title: text("title").notNull(),
    /** Contenuto della lezione in markdown semplice. */
    content: text("content").notNull(),
    /** Minuti di lettura stimati. */
    minutes: integer("minutes").notNull().default(5),
  },
  (table) => [unique().on(table.moduleKey, table.ord)],
);

/** Domande a scelta multipla di fine lezione (seedate, nessun costo AI). */
export const moduleQuestionsTable = pgTable("module_questions", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => moduleLessonsTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull(),
});

/** Avanzamento dello studente sulle lezioni dei moduli. */
export const moduleLessonProgressTable = pgTable(
  "module_lesson_progress",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => moduleLessonsTable.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id").notNull(),
    quizScore: integer("quiz_score"),
    quizTotal: integer("quiz_total"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.lessonId, table.authUserId)],
);

export const insertModuleLessonSchema = createInsertSchema(moduleLessonsTable).omit({ id: true });
export type ModuleLesson = typeof moduleLessonsTable.$inferSelect;
export type ModuleQuestion = typeof moduleQuestionsTable.$inferSelect;
export type ModuleLessonProgress = typeof moduleLessonProgressTable.$inferSelect;
export type InsertModuleLesson = z.infer<typeof insertModuleLessonSchema>;
