import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod/v4";
import { db, institutionsTable, institutionMembersTable, teachersTable } from "@sillabo/db";
import { requireTeacher } from "../middlewares/auth";

const router: IRouter = Router();

const AddMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["amministratore", "docente"]).default("docente"),
});

const UpdateMemberSchema = z.object({
  role: z.enum(["amministratore", "docente"]),
});

const UpdateLicenseSchema = z.object({
  plan: z.enum(["prova", "istituto"]).optional(),
  seats: z.number().int().min(1).max(100000).nullable().optional(),
  licenseExpiresAt: z.string().datetime().nullable().optional(),
  licenseNotes: z.string().trim().max(500).nullable().optional(),
});

/** Stato della licenza calcolato: attiva, scaduta o in prova. */
function licenseStatus(inst: { plan: string; licenseExpiresAt: Date | null }): "prova" | "attiva" | "scaduta" {
  if (inst.plan !== "istituto") return "prova";
  if (inst.licenseExpiresAt && inst.licenseExpiresAt.getTime() < Date.now()) return "scaduta";
  return "attiva";
}

/** Appartenenza del docente autenticato all'istituto (null se non ne fa parte). */
async function membership(institutionId: number, teacherId: number) {
  const [row] = await db
    .select()
    .from(institutionMembersTable)
    .where(
      and(
        eq(institutionMembersTable.institutionId, institutionId),
        eq(institutionMembersTable.teacherId, teacherId),
      ),
    );
  return row ?? null;
}

/** Licenza dell'istituto, posti occupati ed elenco dei membri. */
router.get("/institutions/:id/license", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [institution] = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.id, institutionId));
  if (!institution) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }

  const mine = await membership(institutionId, req.teacher!.id);

  const members = await db
    .select({
      id: institutionMembersTable.id,
      teacherId: institutionMembersTable.teacherId,
      role: institutionMembersTable.role,
      createdAt: institutionMembersTable.createdAt,
      name: teachersTable.name,
      email: teachersTable.email,
    })
    .from(institutionMembersTable)
    .innerJoin(teachersTable, eq(teachersTable.id, institutionMembersTable.teacherId))
    .where(eq(institutionMembersTable.institutionId, institutionId))
    .orderBy(institutionMembersTable.id);

  res.json({
    institution: {
      id: institution.id,
      name: institution.name,
      city: institution.city,
      plan: institution.plan,
      seats: institution.seats,
      licenseExpiresAt: institution.licenseExpiresAt,
      licenseNotes: institution.licenseNotes,
    },
    status: licenseStatus(institution),
    seatsUsed: members.length,
    seatsAvailable: institution.seats === null ? null : Math.max(0, institution.seats - members.length),
    members,
    isAdmin: mine?.role === "amministratore",
  });
});

/**
 * Rivendica un istituto rimasto senza amministratori (creato prima che
 * esistesse il concetto di appartenenza). Se qualcuno lo amministra già,
 * la richiesta viene rifiutata.
 */
router.post("/institutions/:id/claim", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [institution] = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.id, institutionId));
  if (!institution) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }

  const [{ members }] = await db
    .select({ members: count() })
    .from(institutionMembersTable)
    .where(eq(institutionMembersTable.institutionId, institutionId));
  if (members > 0) {
    res.status(409).json({ error: "Questo istituto ha già un amministratore" });
    return;
  }

  const [created] = await db
    .insert(institutionMembersTable)
    .values({ institutionId, teacherId: req.teacher!.id, role: "amministratore" })
    .returning();

  res.status(201).json(created);
});

/** L'amministratore attiva un docente già registrato: occupa un posto. */
router.post("/institutions/:id/members", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = AddMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const mine = await membership(institutionId, req.teacher!.id);
  if (mine?.role !== "amministratore") {
    res.status(403).json({ error: "Solo un amministratore dell'istituto può attivare utenti" });
    return;
  }

  const [institution] = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.id, institutionId));
  if (!institution) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }
  if (licenseStatus(institution) === "scaduta") {
    res.status(403).json({ error: "La licenza dell'istituto è scaduta: non è possibile attivare nuovi utenti" });
    return;
  }

  // Il docente deve essersi già registrato su Sillabo.
  const [teacher] = await db
    .select()
    .from(teachersTable)
    .where(eq(teachersTable.email, parsed.data.email.toLowerCase()));
  if (!teacher) {
    res.status(404).json({
      error: "Nessun docente registrato con questa email. Chiedigli di registrarsi, poi riprova.",
    });
    return;
  }

  const already = await membership(institutionId, teacher.id);
  if (already) {
    res.status(409).json({ error: "Questo docente fa già parte dell'istituto" });
    return;
  }

  // Controllo posti: la licenza è il vincolo commerciale.
  if (institution.seats !== null) {
    const [{ used }] = await db
      .select({ used: count() })
      .from(institutionMembersTable)
      .where(eq(institutionMembersTable.institutionId, institutionId));
    if (used >= institution.seats) {
      res.status(409).json({
        error: `Posti esauriti: la licenza ne prevede ${institution.seats}. Liberane uno o richiedi un aumento.`,
      });
      return;
    }
  }

  const [created] = await db
    .insert(institutionMembersTable)
    .values({ institutionId, teacherId: teacher.id, role: parsed.data.role })
    .returning();

  res.status(201).json({ ...created, name: teacher.name, email: teacher.email });
});

/** Cambia il ruolo di un membro (docente <-> amministratore). */
router.patch("/institutions/:id/members/:memberId", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(institutionId) || !Number.isInteger(memberId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = UpdateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const mine = await membership(institutionId, req.teacher!.id);
  if (mine?.role !== "amministratore") {
    res.status(403).json({ error: "Solo un amministratore può modificare i ruoli" });
    return;
  }

  const [target] = await db
    .select()
    .from(institutionMembersTable)
    .where(
      and(eq(institutionMembersTable.id, memberId), eq(institutionMembersTable.institutionId, institutionId)),
    );
  if (!target) {
    res.status(404).json({ error: "Membro non trovato" });
    return;
  }

  // Non lasciare l'istituto senza amministratori.
  if (target.role === "amministratore" && parsed.data.role === "docente") {
    const [{ admins }] = await db
      .select({ admins: count() })
      .from(institutionMembersTable)
      .where(
        and(
          eq(institutionMembersTable.institutionId, institutionId),
          eq(institutionMembersTable.role, "amministratore"),
        ),
      );
    if (admins <= 1) {
      res.status(409).json({ error: "Deve restare almeno un amministratore dell'istituto" });
      return;
    }
  }

  const [updated] = await db
    .update(institutionMembersTable)
    .set({ role: parsed.data.role })
    .where(eq(institutionMembersTable.id, memberId))
    .returning();

  res.json(updated);
});

/** Disattiva un membro: libera il posto. */
router.delete("/institutions/:id/members/:memberId", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(institutionId) || !Number.isInteger(memberId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const mine = await membership(institutionId, req.teacher!.id);
  if (mine?.role !== "amministratore") {
    res.status(403).json({ error: "Solo un amministratore può disattivare utenti" });
    return;
  }

  const [target] = await db
    .select()
    .from(institutionMembersTable)
    .where(
      and(eq(institutionMembersTable.id, memberId), eq(institutionMembersTable.institutionId, institutionId)),
    );
  if (!target) {
    res.status(404).json({ error: "Membro non trovato" });
    return;
  }

  if (target.role === "amministratore") {
    const [{ admins }] = await db
      .select({ admins: count() })
      .from(institutionMembersTable)
      .where(
        and(
          eq(institutionMembersTable.institutionId, institutionId),
          eq(institutionMembersTable.role, "amministratore"),
        ),
      );
    if (admins <= 1) {
      res.status(409).json({ error: "Deve restare almeno un amministratore dell'istituto" });
      return;
    }
  }

  await db.delete(institutionMembersTable).where(eq(institutionMembersTable.id, memberId));
  res.status(204).end();
});

/** Aggiorna la licenza (posti, scadenza, piano). */
router.patch("/institutions/:id/license", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = UpdateLicenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const mine = await membership(institutionId, req.teacher!.id);
  if (mine?.role !== "amministratore") {
    res.status(403).json({ error: "Solo un amministratore può modificare la licenza" });
    return;
  }

  // Non si possono ridurre i posti sotto quelli già occupati.
  if (parsed.data.seats != null) {
    const [{ used }] = await db
      .select({ used: count() })
      .from(institutionMembersTable)
      .where(eq(institutionMembersTable.institutionId, institutionId));
    if (parsed.data.seats < used) {
      res.status(409).json({
        error: `Ci sono già ${used} utenti attivi: non puoi impostare meno posti di così.`,
      });
      return;
    }
  }

  const [updated] = await db
    .update(institutionsTable)
    .set({
      ...(parsed.data.plan !== undefined ? { plan: parsed.data.plan } : {}),
      ...(parsed.data.seats !== undefined ? { seats: parsed.data.seats } : {}),
      ...(parsed.data.licenseExpiresAt !== undefined
        ? { licenseExpiresAt: parsed.data.licenseExpiresAt ? new Date(parsed.data.licenseExpiresAt) : null }
        : {}),
      ...(parsed.data.licenseNotes !== undefined ? { licenseNotes: parsed.data.licenseNotes } : {}),
    })
    .where(eq(institutionsTable.id, institutionId))
    .returning();

  res.json(updated);
});

export default router;
