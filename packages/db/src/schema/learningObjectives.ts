import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { institutionsTable } from "./institutions";
import { teachersTable } from "./teachers";
import { materialsTable } from "./materials";

/**
 * La mappa degli obiettivi di apprendimento: cosa uno studente deve saper
 * fare, materia per materia e anno per anno.
 *
 * E' il vocabolario comune di tutto il ciclo "voto -> diagnosi -> recupero":
 * una correzione dice su QUALE obiettivo lo studente ha sbagliato, il
 * recupero ripropone QUELL'obiettivo, la mappa della classe conta QUANTI
 * studenti lo hanno fragile. Senza un vocabolario condiviso ognuna di queste
 * viste parlerebbe una lingua diversa.
 *
 * Due livelli:
 *  - institution_id NULL: catalogo base di Sillabo (seed). Nasce come
 *    "bozza_da_rivedere": e' una proposta costruita sulle Indicazioni
 *    nazionali, non un programma ufficiale, e va letta da un docente.
 *  - institution_id valorizzato: obiettivo aggiunto da un istituto.
 *
 * Un istituto non copia il catalogo: lo adatta con institution_objective_overrides
 * (rinomina, descrive meglio, disattiva). Cosi' un aggiornamento del catalogo
 * base raggiunge tutti senza cancellare il lavoro dei dipartimenti.
 */
export const learningObjectivesTable = pgTable(
  "learning_objectives",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id").references(() => institutionsTable.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    /** Stesse etichette di classes.gradeLevel (es. "1ª Superiore"). */
    gradeLevel: text("grade_level").notNull(),
    /** Codice breve e stabile, es. "MAT1.ALG.03". */
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** "bozza_da_rivedere" | "rivisto" */
    reviewStatus: text("review_status").notNull().default("bozza_da_rivedere"),
    active: boolean("active").notNull().default(true),
    /** Ordine di presentazione dentro materia+anno. */
    ord: integer("ord").notNull().default(0),
    createdByTeacherId: integer("created_by_teacher_id").references(() => teachersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Due indici parziali perche' NULL non partecipa ai vincoli di unicita'.
    uniqueIndex("learning_objectives_base_code_idx")
      .on(t.subject, t.gradeLevel, t.code)
      .where(sql`${t.institutionId} IS NULL`),
    uniqueIndex("learning_objectives_institution_code_idx")
      .on(t.institutionId, t.subject, t.gradeLevel, t.code)
      .where(sql`${t.institutionId} IS NOT NULL`),
  ],
);

/** Propedeuticita': per affrontare `objective_id` serve `requires_objective_id`. */
export const learningObjectivePrerequisitesTable = pgTable(
  "learning_objective_prerequisites",
  {
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
    requiresObjectiveId: integer("requires_objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.objectiveId, t.requiresObjectiveId] })],
);

/**
 * Adattamento di un obiettivo del catalogo base da parte di un istituto.
 * Un campo NULL significa "tieni quello del catalogo".
 */
export const institutionObjectiveOverridesTable = pgTable(
  "institution_objective_overrides",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutionsTable.id, { onDelete: "cascade" }),
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
    title: text("title"),
    description: text("description"),
    active: boolean("active"),
    /** Un docente dell'istituto ha letto e confermato questo obiettivo. */
    reviewedByTeacherId: integer("reviewed_by_teacher_id").references(() => teachersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("institution_objective_overrides_unique").on(t.institutionId, t.objectiveId)],
);

/** Quali obiettivi copre un materiale. Sostituisce il testo libero curriculum_topic. */
export const materialObjectivesTable = pgTable(
  "material_objectives",
  {
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => learningObjectivesTable.id, { onDelete: "cascade" }),
    /** "ai" | "docente": chi ha fatto il collegamento. */
    source: text("source").notNull().default("docente"),
  },
  (t) => [primaryKey({ columns: [t.materialId, t.objectiveId] })],
);

export const insertLearningObjectiveSchema = createInsertSchema(learningObjectivesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLearningObjective = z.infer<typeof insertLearningObjectiveSchema>;
export type LearningObjective = typeof learningObjectivesTable.$inferSelect;
export type InstitutionObjectiveOverride = typeof institutionObjectiveOverridesTable.$inferSelect;
export type MaterialObjective = typeof materialObjectivesTable.$inferSelect;
