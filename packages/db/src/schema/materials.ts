import { pgTable, serial, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  content: text("content").notNull(),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  curriculumTopic: text("curriculum_topic"),
  curriculumSubtopic: text("curriculum_subtopic"),
  simplifiedContent: text("simplified_content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const materialClassesTable = pgTable(
  "material_classes",
  {
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.materialId, table.classId] })],
);

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({
  id: true,
  createdAt: true,
  curriculumTopic: true,
  curriculumSubtopic: true,
  simplifiedContent: true,
});
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
export type MaterialClass = typeof materialClassesTable.$inferSelect;
