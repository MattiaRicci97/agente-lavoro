import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq, and, count, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  institutionsTable,
  institutionMembersTable,
  invitesTable,
  teachersTable,
  classesTable,
  classTeachersTable,
} from "@sillabo/db";
import { requireAuth, requireTeacher, forgetCachedUser } from "../middlewares/auth";
import { updateUserMetadata } from "../lib/supabase";

const router: IRouter = Router();

const CreateInviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["amministratore", "docente"]).default("docente"),
  classId: z.number().int().positive().nullable().optional(),
  subject: z.string().trim().max(100).default(""),
});

/** L'utente autenticato e' amministratore di questo istituto? */
async function isAdmin(institutionId: number, teacherId: number): Promise<boolean> {
  const [row] = await db
    .select({ role: institutionMembersTable.role })
    .from(institutionMembersTable)
    .where(
      and(
        eq(institutionMembersTable.institutionId, institutionId),
        eq(institutionMembersTable.teacherId, teacherId),
      ),
    );
  return row?.role === "amministratore";
}

/** Posti gia' impegnati: membri attivi + inviti ancora in sospeso. */
async function seatsCommitted(institutionId: number): Promise<number> {
  const [{ members }] = await db
    .select({ members: count() })
    .from(institutionMembersTable)
    .where(eq(institutionMembersTable.institutionId, institutionId));
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(invitesTable)
    .where(and(eq(invitesTable.institutionId, institutionId), eq(invitesTable.status, "pending")));
  return Number(members) + Number(pending);
}

/** L'amministratore invita un docente: genera un link da inoltrare. */
router.post("/institutions/:id/invites", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = CreateInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await isAdmin(institutionId, req.teacher!.id))) {
    res.status(403).json({ error: "Solo un amministratore può invitare docenti" });
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

  const email = parsed.data.email.toLowerCase();

  // Chi e' gia' dentro non va reinvitato.
  const [existingTeacher] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.email, email));
  if (existingTeacher) {
    const [alreadyMember] = await db
      .select({ id: institutionMembersTable.id })
      .from(institutionMembersTable)
      .where(
        and(
          eq(institutionMembersTable.institutionId, institutionId),
          eq(institutionMembersTable.teacherId, existingTeacher.id),
        ),
      );
    if (alreadyMember) {
      res.status(409).json({ error: "Questo docente fa già parte dell'istituto" });
      return;
    }
  }

  const [duplicate] = await db
    .select({ id: invitesTable.id })
    .from(invitesTable)
    .where(
      and(
        eq(invitesTable.institutionId, institutionId),
        eq(invitesTable.email, email),
        eq(invitesTable.status, "pending"),
      ),
    );
  if (duplicate) {
    res.status(409).json({ error: "C'è già un invito in sospeso per questa email" });
    return;
  }

  // Un invito impegna un posto come un membro: non se ne creano piu' della licenza.
  if (institution.seats !== null && (await seatsCommitted(institutionId)) >= institution.seats) {
    res.status(409).json({
      error: `Posti esauriti: la licenza ne prevede ${institution.seats}, contando anche gli inviti in sospeso.`,
    });
    return;
  }

  // La classe, se indicata, dev'essere dell'istituto.
  if (parsed.data.classId != null) {
    const [cls] = await db
      .select({ id: classesTable.id })
      .from(classesTable)
      .where(and(eq(classesTable.id, parsed.data.classId), eq(classesTable.institutionId, institutionId)));
    if (!cls) {
      res.status(404).json({ error: "Classe non trovata in questo istituto" });
      return;
    }
  }

  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 giorni

  const [invite] = await db
    .insert(invitesTable)
    .values({
      token,
      institutionId,
      email,
      role: parsed.data.role,
      classId: parsed.data.classId ?? null,
      subject: parsed.data.subject,
      invitedByTeacherId: req.teacher!.id,
      expiresAt,
    })
    .returning();

  res.status(201).json(invite);
});

/** Gli inviti ancora in sospeso di un istituto (per l'amministratore). */
router.get("/institutions/:id/invites", requireTeacher, async (req, res): Promise<void> => {
  const institutionId = Number(req.params.id);
  if (!Number.isInteger(institutionId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await isAdmin(institutionId, req.teacher!.id))) {
    res.status(403).json({ error: "Solo un amministratore può vedere gli inviti" });
    return;
  }

  const rows = await db
    .select({
      id: invitesTable.id,
      token: invitesTable.token,
      email: invitesTable.email,
      role: invitesTable.role,
      classId: invitesTable.classId,
      subject: invitesTable.subject,
      status: invitesTable.status,
      createdAt: invitesTable.createdAt,
      className: classesTable.name,
    })
    .from(invitesTable)
    .leftJoin(classesTable, eq(classesTable.id, invitesTable.classId))
    .where(and(eq(invitesTable.institutionId, institutionId), eq(invitesTable.status, "pending")))
    .orderBy(invitesTable.id);

  res.json(rows);
});

/** L'amministratore ritira un invito non ancora accettato. */
router.delete("/invites/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.id, id));
  if (!invite || invite.status !== "pending") {
    res.status(404).json({ error: "Invito non trovato" });
    return;
  }
  if (!(await isAdmin(invite.institutionId, req.teacher!.id))) {
    res.status(403).json({ error: "Solo un amministratore può ritirare gli inviti" });
    return;
  }

  await db.update(invitesTable).set({ status: "revoked" }).where(eq(invitesTable.id, id));
  res.status(204).end();
});

/**
 * Anteprima dell'invito, leggibile senza essere loggati: chi apre il link
 * deve sapere di cosa si tratta prima di registrarsi.
 */
router.get("/invites/:token", async (req, res): Promise<void> => {
  const [invite] = await db
    .select({
      role: invitesTable.role,
      status: invitesTable.status,
      expiresAt: invitesTable.expiresAt,
      email: invitesTable.email,
      institutionName: institutionsTable.name,
      city: institutionsTable.city,
      className: classesTable.name,
      subject: invitesTable.subject,
      inviterName: teachersTable.name,
    })
    .from(invitesTable)
    .innerJoin(institutionsTable, eq(institutionsTable.id, invitesTable.institutionId))
    .leftJoin(classesTable, eq(classesTable.id, invitesTable.classId))
    .leftJoin(teachersTable, eq(teachersTable.id, invitesTable.invitedByTeacherId))
    .where(eq(invitesTable.token, String(req.params.token)));

  if (!invite) {
    res.status(404).json({ error: "Invito non trovato" });
    return;
  }

  const expired = !!invite.expiresAt && invite.expiresAt.getTime() < Date.now();
  res.json({
    institutionName: invite.institutionName,
    city: invite.city,
    role: invite.role,
    className: invite.className,
    subject: invite.subject,
    inviterName: invite.inviterName,
    email: invite.email,
    status: expired && invite.status === "pending" ? "expired" : invite.status,
  });
});

/**
 * L'utente autenticato accetta l'invito.
 *
 * In un colpo solo: lo rende docente (se non lo e' gia'), lo iscrive
 * all'istituto occupando un posto, e — se l'invito indicava una classe — lo
 * mette nel suo consiglio con la materia assegnata.
 */
router.post("/invites/:token/accept", requireAuth, async (req, res): Promise<void> => {
  const [invite] = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.token, String(req.params.token)));
  if (!invite) {
    res.status(404).json({ error: "Invito non trovato" });
    return;
  }
  if (invite.status !== "pending") {
    res.status(409).json({ error: "Questo invito è già stato usato o ritirato" });
    return;
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "Questo invito è scaduto. Chiedine uno nuovo all'amministratore." });
    return;
  }

  const [institution] = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.id, invite.institutionId));
  if (!institution) {
    res.status(404).json({ error: "Istituto non trovato" });
    return;
  }

  // Chi accetta diventa docente: l'invito e' rivolto al personale.
  if (req.authUser!.role !== "docente") {
    if (req.authUser!.role === "studente") {
      res.status(409).json({ error: "Questo account è registrato come studente: non può accettare un invito docente." });
      return;
    }
    try {
      await updateUserMetadata(req.accessToken!, { role: "docente" });
      forgetCachedUser(req.authUserId!);
    } catch (err) {
      req.log.error({ err }, "Impossibile impostare il ruolo accettando l'invito");
      res.status(500).json({ error: "Non è stato possibile completare l'attivazione. Riprova." });
      return;
    }
  }

  // Assicura la riga docente.
  let [teacher] = await db
    .select()
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, req.authUserId!));
  if (!teacher) {
    [teacher] = await db
      .insert(teachersTable)
      .values({ authUserId: req.authUserId!, name: req.authUser!.name, email: req.authUser!.email })
      .returning();
  }

  const [already] = await db
    .select({ id: institutionMembersTable.id })
    .from(institutionMembersTable)
    .where(
      and(
        eq(institutionMembersTable.institutionId, invite.institutionId),
        eq(institutionMembersTable.teacherId, teacher.id),
      ),
    );

  if (!already) {
    // Controllo posti al momento dell'attivazione (senza contare quest'invito).
    if (institution.seats !== null) {
      const [{ members }] = await db
        .select({ members: count() })
        .from(institutionMembersTable)
        .where(eq(institutionMembersTable.institutionId, invite.institutionId));
      if (Number(members) >= institution.seats) {
        res.status(409).json({ error: "L'istituto ha esaurito i posti disponibili. Contatta l'amministratore." });
        return;
      }
    }
    await db
      .insert(institutionMembersTable)
      .values({ institutionId: invite.institutionId, teacherId: teacher.id, role: invite.role })
      .onConflictDoNothing();
  }

  // Inserimento nel consiglio della classe assegnata, se ancora esiste.
  if (invite.classId) {
    const [cls] = await db.select({ id: classesTable.id }).from(classesTable).where(eq(classesTable.id, invite.classId));
    if (cls) {
      await db
        .insert(classTeachersTable)
        .values({ classId: invite.classId, teacherId: teacher.id, subject: invite.subject, role: "docente" })
        .onConflictDoNothing();
    }
  }

  await db
    .update(invitesTable)
    .set({ status: "accepted", acceptedByAuthUserId: req.authUserId!, acceptedAt: new Date() })
    .where(eq(invitesTable.id, invite.id));

  res.json({ institutionId: invite.institutionId, institutionName: institution.name });
});

export default router;
