import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { writtenExamsTable } from "./writtenExams";
import { teachersTable } from "./teachers";

/**
 * La consegna di un singolo studente per un compito assegnato.
 *
 * Il compito (written_exams) e' uno solo per la classe; ogni studente
 * consegna la propria versione, che resta separata da quella dei compagni.
 * L'AI prepara una proposta di valutazione, ma il voto che lo studente vede
 * e' quello firmato dal docente.
 */
export const writtenExamSubmissionsTable = pgTable(
  "written_exam_submissions",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => writtenExamsTable.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id").notNull(),
    studentName: text("student_name").notNull(),
    classId: integer("class_id"),
    answer: text("answer").notNull(),
    /** Proposta dell'assistente, mai mostrata da sola allo studente. */
    aiGrade: integer("ai_grade"),
    aiFeedback: text("ai_feedback").notNull().default(""),
    /** "da_validare" | "validata" */
    validationStatus: text("validation_status").notNull().default("da_validare"),
    teacherGrade: integer("teacher_grade"),
    teacherFeedback: text("teacher_feedback"),
    validatedByTeacherId: integer("validated_by_teacher_id").references(() => teachersTable.id, {
      onDelete: "set null",
    }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("written_exam_submissions_unique").on(t.examId, t.authUserId)],
);

export const insertWrittenExamSubmissionSchema = createInsertSchema(writtenExamSubmissionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWrittenExamSubmission = z.infer<typeof insertWrittenExamSubmissionSchema>;
export type WrittenExamSubmission = typeof writtenExamSubmissionsTable.$inferSelect;
