import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { institutionsTable } from "./institutions";
import { classesTable } from "./classes";
import { teachersTable } from "./teachers";

/**
 * Inviti dei docenti a un istituto.
 *
 * Prima, per attivare un docente, l'amministratore doveva aspettare che si
 * registrasse per conto suo e poi attivarlo a mano: due passaggi scollegati.
 * Con l'invito e' l'amministratore a fare il primo passo. Genera un link
 * (che puo' inoltrare per email, chat o di persona); chi lo apre si registra
 * e si ritrova gia' dentro l'istituto, con la materia e la classe che gli
 * erano state assegnate.
 *
 * Il link porta un token: e' quello a legare l'iscrizione all'invito, senza
 * dover indovinare dall'email. L'email resta solo un promemoria di a chi era
 * destinato.
 */
export const invitesTable = pgTable("invites", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutionsTable.id, { onDelete: "cascade" }),
  /** A chi era destinato l'invito (promemoria, non un vincolo). */
  email: text("email").notNull(),
  /** "amministratore" | "docente" */
  role: text("role").notNull().default("docente"),
  /** Classe in cui inserirlo subito (facoltativo). */
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "set null" }),
  /** Materia con cui entra nel consiglio di quella classe. */
  subject: text("subject").notNull().default(""),
  invitedByTeacherId: integer("invited_by_teacher_id").references(() => teachersTable.id, {
    onDelete: "set null",
  }),
  /** "pending" | "accepted" | "revoked" */
  status: text("status").notNull().default("pending"),
  acceptedByAuthUserId: text("accepted_by_auth_user_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInviteSchema = createInsertSchema(invitesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invitesTable.$inferSelect;
