import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * I telefoni su cui un utente ha installato l'app e accettato le notifiche.
 * Il token identifica il dispositivo presso Firebase; non contiene dati
 * dell'utente. Si cancella da solo quando Firebase lo dichiara scaduto.
 */
export const deviceTokensTable = pgTable("device_tokens", {
  id: serial("id").primaryKey(),
  authUserId: text("auth_user_id").notNull(),
  token: text("token").notNull().unique(),
  /** "android" | "ios" */
  platform: text("platform").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeviceToken = typeof deviceTokensTable.$inferSelect;
