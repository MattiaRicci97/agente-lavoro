import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { institutionsTable } from "./institutions";
import { teachersTable } from "./teachers";

/**
 * Appartenenza di un docente a un istituto: è questo il "posto" occupato
 * nella licenza. Un membro può essere amministratore (dirigente o animatore
 * digitale, gestisce utenti e licenza) oppure docente.
 */
export const institutionMembersTable = pgTable(
  "institution_members",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutionsTable.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => teachersTable.id, { onDelete: "cascade" }),
    /** "amministratore" | "docente" */
    role: text("role").notNull().default("docente"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("institution_members_unique").on(t.institutionId, t.teacherId)],
);

export type InstitutionMember = typeof institutionMembersTable.$inferSelect;
