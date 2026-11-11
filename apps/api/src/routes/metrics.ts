import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, asc } from "drizzle-orm";
import { db, classesTable, institutionsTable, institutionMembersTable, recoverySetsTable } from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";
import { teacherClassIds } from "../lib/classAccess";
import { teacherCanAccessInstitution } from "../lib/objectives";
import { metricsForSet, totalsOf, type SetMetrics } from "../lib/metrics";

const router: IRouter = Router();

function csvCell(v: unknown): string {
  // I decimali all'italiana, cosi' Excel li legge come numeri.
  const s = v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Le classi dell'istituto che il docente puo' vedere nelle metriche:
 * tutte se e' amministratore, altrimenti solo quelle in cui insegna.
 */
async function visibleClasses(teacherId: number, institutionId: number) {
  const classes = await db
    .select({ id: classesTable.id, name: classesTable.name })
    .from(classesTable)
    .where(eq(classesTable.institutionId, institutionId))
    .orderBy(asc(classesTable.name));
  const [member] = await db
    .select({ role: institutionMembersTable.role })
    .from(institutionMembersTable)
    .where(and(eq(institutionMembersTable.institutionId, institutionId), eq(institutionMembersTable.teacherId, teacherId)));
  if (member?.role === "amministratore") return { classes, scope: "istituto" as const };
  const mine = new Set(await teacherClassIds(teacherId));
  return { classes: classes.filter((c) => mine.has(c.id)), scope: "mie_classi" as const };
}

async function buildReport(req: Request, res: Response) {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId) || !(await teacherCanAccessInstitution(req.teacher!.id, institutionId))) {
    res.status(404).json({ error: "Istituto non trovato" });
    return null;
  }
  const [institution] = await db.select().from(institutionsTable).where(eq(institutionsTable.id, institutionId));
  const { classes, scope } = await visibleClasses(req.teacher!.id, institutionId);
  const classFilter = Number(req.query.classId);
  const wanted = Number.isInteger(classFilter) ? classes.filter((c) => c.id === classFilter) : classes;
  const anonymize = req.query.anonymize === "1";

  const sets = wanted.length
    ? await db
        .select()
        .from(recoverySetsTable)
        .where(and(inArray(recoverySetsTable.classId, wanted.map((c) => c.id)), eq(recoverySetsTable.status, "approvato")))
        .orderBy(asc(recoverySetsTable.approvedAt))
    : [];
  const rows: SetMetrics[] = [];
  for (const set of sets) rows.push(await metricsForSet(set));

  // Anonimizzazione: classi e recuperi diventano etichette progressive.
  const classLabel = new Map(wanted.map((c, i) => [c.id, anonymize ? `Classe ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}` : c.name]));
  const labelled = rows.map((r, i) => ({
    ...r,
    className: classLabel.get(r.classId) ?? "",
    title: anonymize ? `Recupero ${i + 1}` : r.title,
  }));
  const byClass = wanted
    .map((c) => ({ classId: c.id, className: classLabel.get(c.id)!, ...totalsOf(rows.filter((r) => r.classId === c.id)) }))
    .filter((c) => c.sets > 0);

  return {
    institution: anonymize ? "Istituto" : (institution?.name ?? ""),
    scope,
    anonymized: anonymize,
    totals: totalsOf(rows),
    classes: byClass,
    sets: labelled,
  };
}

/** Efficacia del recupero, per istituto (o per le proprie classi), in JSON. */
router.get("/institutions/:id/recovery-metrics", requireTeacher, async (req, res): Promise<void> => {
  const report = await buildReport(req, res);
  if (report) res.json(report);
});

/** Le stesse metriche in CSV, una riga per recupero. */
router.get("/institutions/:id/recovery-metrics/export", requireTeacher, async (req, res): Promise<void> => {
  const report = await buildReport(req, res);
  if (!report) return;
  const lines = [
    "Istituto;Classe;Recupero;Approvato il;Studenti;Obiettivi a recupero;Verificati al riscontro;Recuperati;Quota recuperati %;Tempo medio di recupero (giorni);Voto medio iniziale;Voto medio riscontro;Variazione;Richiami dovuti;Richiami svolti;Partecipazione %;Studenti attivi",
  ];
  for (const r of report.sets) {
    lines.push(
      [
        report.institution, r.className, r.title, r.approvedAt ? r.approvedAt.toISOString().slice(0, 10) : "",
        r.students, r.gaps, r.gapsAssessed, r.gapsRecovered, r.recoveredPercent, r.avgRecoveryDays,
        r.initialGrade, r.followupGrade, r.gradeDelta, r.itemsDue, r.itemsDone, r.participationPercent, r.studentsActive,
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="efficacia-recupero${report.anonymized ? "-anonimo" : ""}.csv"`);
  res.send("﻿" + lines.join("\r\n"));
});

export default router;
