import { pgTable, serial, text, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { materialsTable } from "./materials";
import { teachersTable } from "./teachers";

/**
 * Gli strumenti che il docente prepara attorno a un materiale: errori tipici
 * da prevenire, spunti per aprire la lezione, glossario, sintesi tradotta.
 *
 * L'assistente scrive la prima stesura (ai_draft), il docente la fa sua
 * (body). I primi due restano del docente; glossario e traduzione possono
 * essere condivisi con la classe, ma solo per sua scelta esplicita: ogni
 * nuova stesura dell'assistente toglie la condivisione.
 */
export const materialToolsTable = pgTable(
  "material_tools",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
    /** "errori_tipici" | "spunti" | "glossario" | "traduzione" | "ripasso_audio" */
    kind: text("kind").notNull(),
    /** Solo per la traduzione: la lingua di arrivo. */
    language: text("language"),
    aiDraft: text("ai_draft").notNull().default(""),
    body: text("body").notNull().default(""),
    shared: boolean("shared").notNull().default(false),
    updatedByTeacherId: integer("updated_by_teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("material_tools_unique").on(t.materialId, t.kind)],
);

export type MaterialTool = typeof materialToolsTable.$inferSelect;
