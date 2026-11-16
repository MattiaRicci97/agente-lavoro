import { pgTable, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { materialsTable } from "./materials";
import { studentsTable } from "./students";

/**
 * Quando uno studente ha aperto un materiale: solo la prima e l'ultima volta.
 * Serve al docente per sapere chi non l'ha ancora aperto prima della lezione;
 * non registra cosa lo studente ha fatto ne' per quanto tempo.
 */
export const materialViewsTable = pgTable(
  "material_views",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("material_views_unique").on(t.materialId, t.studentId)],
);

export type MaterialView = typeof materialViewsTable.$inferSelect;
