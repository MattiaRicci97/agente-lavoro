import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Istituto scolastico: è l'organizzazione a cui Sillabo viene venduto.
 * La licenza definisce quanti docenti può attivare ("posti") e fino a quando.
 */
export const institutionsTable = pgTable("institutions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  /** "prova" (self-serve) | "istituto" (licenza acquistata) */
  plan: text("plan").notNull().default("prova"),
  /** Posti docente disponibili; null = illimitati. */
  seats: integer("seats"),
  /** Scadenza della licenza; null = senza scadenza. */
  licenseExpiresAt: timestamp("license_expires_at", { withTimezone: true }),
  /** Riferimento contratto/ordine, a uso interno. */
  licenseNotes: text("license_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInstitutionSchema = createInsertSchema(institutionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertInstitution = z.infer<typeof insertInstitutionSchema>;
export type Institution = typeof institutionsTable.$inferSelect;
