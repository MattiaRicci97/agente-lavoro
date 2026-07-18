import { pgTable, serial, text, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { institutionsTable } from "./institutions";

export const modulesTable = pgTable("modules", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  priceLabel: text("price_label").notNull(),
});

export const insertModuleSchema = createInsertSchema(modulesTable).omit({ id: true });
export type InsertModuleRecord = z.infer<typeof insertModuleSchema>;
export type ModuleRecord = typeof modulesTable.$inferSelect;

export const institutionModulesTable = pgTable(
  "institution_modules",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutionsTable.id, { onDelete: "cascade" }),
    moduleId: integer("module_id")
      .notNull()
      .references(() => modulesTable.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.institutionId, table.moduleId)],
);

export const insertInstitutionModuleSchema = createInsertSchema(institutionModulesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertInstitutionModule = z.infer<typeof insertInstitutionModuleSchema>;
export type InstitutionModule = typeof institutionModulesTable.$inferSelect;
