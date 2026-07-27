import { pgTable, serial, text, timestamp, integer, boolean, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { teachersTable } from "./teachers";

/**
 * La bacheca di classe: il canale con cui il docente parla ai suoi studenti.
 *
 * Sillabo fa da lavagna, non da mittente. Nessun avviso viene mai scritto o
 * inviato dall'assistente di sua iniziativa: l'AI puo' al massimo preparare
 * una bozza che il docente rilegge, modifica e pubblica a suo nome.
 *
 * Oltre agli avvisi scritti a mano, sulla bacheca compaiono in automatico le
 * cose che il docente ha comunque gia' fatto (materiale condiviso, compito
 * assegnato, verifica messa in calendario), cosi' la classe ha un unico
 * posto dove guardare invece di doverle scoprire girando per l'app.
 */
export const classPostsTable = pgTable(
  "class_posts",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
    /** Nome del docente al momento della pubblicazione (resta anche se il profilo cambia). */
    authorName: text("author_name").notNull(),
    /** "avviso" | "compito" | "materiale" | "verifica" */
    kind: text("kind").notNull().default("avviso"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** Fissato in cima alla bacheca. */
    pinned: boolean("pinned").notNull().default(false),
    /** Gli studenti possono fare domande sotto l'avviso. */
    commentsEnabled: boolean("comments_enabled").notNull().default(true),
    /** Riferimenti facoltativi a cio' di cui l'avviso parla. */
    materialId: integer("material_id"),
    writtenExamId: integer("written_exam_id"),
    examDateId: integer("exam_date_id"),
    /** true se la bozza e' stata preparata dall'assistente (il testo resta del docente). */
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("class_posts_class_idx").on(t.classId, t.createdAt)],
);

/**
 * Conferme di lettura: il docente sa chi ha visto l'avviso e chi no.
 * Non e' sorveglianza sullo studio, e' la ricevuta di una comunicazione.
 */
export const classPostReadsTable = pgTable(
  "class_post_reads",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => classPostsTable.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id").notNull(),
    studentName: text("student_name").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("class_post_reads_unique").on(t.postId, t.authUserId)],
);

/**
 * Domande e risposte sotto un avviso. Rispondono le persone: qui l'assistente
 * non interviene mai, perche' e' esattamente la relazione che non va sostituita.
 */
export const classPostCommentsTable = pgTable("class_post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => classPostsTable.id, { onDelete: "cascade" }),
  authUserId: text("auth_user_id").notNull(),
  authorName: text("author_name").notNull(),
  /** "docente" | "studente" */
  authorRole: text("author_role").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClassPostSchema = createInsertSchema(classPostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClassPost = z.infer<typeof insertClassPostSchema>;
export type ClassPost = typeof classPostsTable.$inferSelect;
export type ClassPostRead = typeof classPostReadsTable.$inferSelect;
export type ClassPostComment = typeof classPostCommentsTable.$inferSelect;
