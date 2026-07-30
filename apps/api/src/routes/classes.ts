import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, count, ne } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  classTeachersTable,
  studentsTable,
  teachersTable,
  institutionMembersTable,
} from "@sillabo/db";
import {
  ListClassesResponse,
  CreateClassBody,
  CreateClassResponse,
  ListStudentsParams,
  ListStudentsResponse,
  CreateStudentParams,
  CreateStudentBody,
  CreateStudentResponse,
} from "@sillabo/api-zod";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import {
  teacherClassIds,
  isClassTeacher,
  isCoordinator,
  studentClassIds,
  classCouncil,
} from "../lib/classAccess";

const router: IRouter = Router();

const JoinSchema = z.object({
  subject: z.string().trim().max(100).default(""),
});

const AddTeacherSchema = z.object({
  email: z.string().trim().email().max(320),
  subject: z.string().trim().max(100).default(""),
  role: z.enum(["coordinatore", "docente"]).default("docente"),
});

const UpdateTeacherSchema = z.object({
  subject: z.string().trim().max(100).optional(),
  role: z.enum(["coordinatore", "docente"]).optional(),
});

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Elenco dei docenti di piu' classi, con nome ed email. */
async function councilWithNames(classIds: number[]) {
  const rows = await classCouncil(classIds);
  if (!rows.length) return new Map<number, any[]>();

  const teachers = await db
    .select({ id: teachersTable.id, name: teachersTable.name, email: teachersTable.email })
    .from(teachersTable)
    .where(inArray(teachersTable.id, Array.from(new Set(rows.map((r) => r.teacherId)))));
  const byId = new Map(teachers.map((t) => [t.id, t]));

  const byClass = new Map<number, any[]>();
  for (const r of rows) {
    const list = byClass.get(r.classId) ?? [];
    list.push({
      id: r.id,
      teacherId: r.teacherId,
      subject: r.subject,
      role: r.role,
      name: byId.get(r.teacherId)?.name ?? "",
      email: byId.get(r.teacherId)?.email ?? "",
    });
    byClass.set(r.classId, list);
  }
  return byClass;
}

/** Le classi in cui il docente insegna, con il consiglio al completo. */
router.get("/classes", requireTeacher, async (req, res): Promise<void> => {
  const ids = await teacherClassIds(req.teacher!.id);
  if (!ids.length) {
    res.json([]);
    return;
  }

  const rows = await db
    .select({
      id: classesTable.id,
      institutionId: classesTable.institutionId,
      teacherId: classesTable.teacherId,
      name: classesTable.name,
      gradeLevel: classesTable.gradeLevel,
      teacherName: classesTable.teacherName,
      joinCode: classesTable.joinCode,
      createdAt: classesTable.createdAt,
      studentsCount: sql<number>`count(${studentsTable.id})::int`,
    })
    .from(classesTable)
    .leftJoin(studentsTable, eq(studentsTable.classId, classesTable.id))
    .where(inArray(classesTable.id, ids))
    .groupBy(classesTable.id)
    .orderBy(classesTable.id);

  res.json(ListClassesResponse.parse(rows));
});

/** Il consiglio di una classe: chi ci insegna, con che materia e che ruolo. */
router.get("/classes/:id/teachers", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  if (!(await isClassTeacher(req.teacher!.id, classId))) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const byClass = await councilWithNames([classId]);
  res.json({
    teachers: byClass.get(classId) ?? [],
    isCoordinator: await isCoordinator(req.teacher!.id, classId),
  });
});

/**
 * Le classi dell'istituto a cui il docente puo' unirsi.
 * Chi appartiene all'istituto insegna nelle sue classi: non deve ricrearle.
 */
router.get("/classes/joinable", requireTeacher, async (req, res): Promise<void> => {
  const memberships = await db
    .select({ institutionId: institutionMembersTable.institutionId })
    .from(institutionMembersTable)
    .where(eq(institutionMembersTable.teacherId, req.teacher!.id));
  if (!memberships.length) {
    res.json([]);
    return;
  }

  const mine = await teacherClassIds(req.teacher!.id);
  const rows = await db
    .select({
      id: classesTable.id,
      name: classesTable.name,
      gradeLevel: classesTable.gradeLevel,
      teacherName: classesTable.teacherName,
      institutionId: classesTable.institutionId,
      studentsCount: sql<number>`count(${studentsTable.id})::int`,
    })
    .from(classesTable)
    .leftJoin(studentsTable, eq(studentsTable.classId, classesTable.id))
    .where(
      inArray(
        classesTable.institutionId,
        memberships.map((m) => m.institutionId),
      ),
    )
    .groupBy(classesTable.id)
    .orderBy(classesTable.name);

  res.json(rows.filter((r) => !mine.includes(r.id)));
});

/** Il docente entra nel consiglio di una classe del proprio istituto. */
router.post("/classes/:id/join", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = JoinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  // Si entra solo nelle classi del proprio istituto.
  const [member] = await db
    .select({ id: institutionMembersTable.id })
    .from(institutionMembersTable)
    .where(
      and(
        eq(institutionMembersTable.teacherId, req.teacher!.id),
        eq(institutionMembersTable.institutionId, cls.institutionId),
      ),
    );
  if (!member) {
    res.status(403).json({ error: "Puoi entrare solo nelle classi del tuo istituto" });
    return;
  }

  if (await isClassTeacher(req.teacher!.id, classId)) {
    res.status(409).json({ error: "Insegni già in questa classe" });
    return;
  }

  const [created] = await db
    .insert(classTeachersTable)
    .values({ classId, teacherId: req.teacher!.id, subject: parsed.data.subject, role: "docente" })
    .returning();

  res.status(201).json(created);
});

/** Il coordinatore aggiunge un collega al consiglio. */
router.post("/classes/:id/teachers", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = AddTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await isCoordinator(req.teacher!.id, classId))) {
    res.status(403).json({ error: "Solo il coordinatore può modificare il consiglio di classe" });
    return;
  }

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

  if (await isClassTeacher(teacher.id, classId)) {
    res.status(409).json({ error: "Questo docente insegna già in questa classe" });
    return;
  }

  const [created] = await db
    .insert(classTeachersTable)
    .values({ classId, teacherId: teacher.id, subject: parsed.data.subject, role: parsed.data.role })
    .returning();

  res.status(201).json({ ...created, name: teacher.name, email: teacher.email });
});

/** Il coordinatore cambia materia o ruolo di un membro del consiglio. */
router.patch("/classes/:id/teachers/:memberId", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(classId) || !Number.isInteger(memberId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = UpdateTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Ognuno puo' correggere la propria materia; il resto lo decide il coordinatore.
  const [target] = await db
    .select()
    .from(classTeachersTable)
    .where(and(eq(classTeachersTable.id, memberId), eq(classTeachersTable.classId, classId)));
  if (!target) {
    res.status(404).json({ error: "Docente non trovato in questa classe" });
    return;
  }

  const coordinator = await isCoordinator(req.teacher!.id, classId);
  const onlyOwnSubject =
    target.teacherId === req.teacher!.id && parsed.data.role === undefined;
  if (!coordinator && !onlyOwnSubject) {
    res.status(403).json({ error: "Solo il coordinatore può modificare il consiglio di classe" });
    return;
  }

  // La classe non puo' restare senza coordinatore.
  if (target.role === "coordinatore" && parsed.data.role === "docente") {
    const [{ coordinators }] = await db
      .select({ coordinators: count() })
      .from(classTeachersTable)
      .where(
        and(eq(classTeachersTable.classId, classId), eq(classTeachersTable.role, "coordinatore")),
      );
    if (coordinators <= 1) {
      res.status(409).json({ error: "Deve restare almeno un coordinatore della classe" });
      return;
    }
  }

  const [updated] = await db
    .update(classTeachersTable)
    .set(parsed.data)
    .where(eq(classTeachersTable.id, memberId))
    .returning();

  res.json(updated);
});

/** Toglie un docente dal consiglio (o se stesso: si esce da una classe). */
router.delete("/classes/:id/teachers/:memberId", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(classId) || !Number.isInteger(memberId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [target] = await db
    .select()
    .from(classTeachersTable)
    .where(and(eq(classTeachersTable.id, memberId), eq(classTeachersTable.classId, classId)));
  if (!target) {
    res.status(404).json({ error: "Docente non trovato in questa classe" });
    return;
  }

  const coordinator = await isCoordinator(req.teacher!.id, classId);
  if (!coordinator && target.teacherId !== req.teacher!.id) {
    res.status(403).json({ error: "Solo il coordinatore può togliere un collega dalla classe" });
    return;
  }

  if (target.role === "coordinatore") {
    const [{ coordinators }] = await db
      .select({ coordinators: count() })
      .from(classTeachersTable)
      .where(
        and(eq(classTeachersTable.classId, classId), eq(classTeachersTable.role, "coordinatore")),
      );
    if (coordinators <= 1) {
      res.status(409).json({ error: "Deve restare almeno un coordinatore della classe" });
      return;
    }
  }

  await db.delete(classTeachersTable).where(eq(classTeachersTable.id, memberId));
  res.status(204).end();
});

router.post("/classes", requireTeacher, async (req, res): Promise<void> => {
  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let joinCode = generateJoinCode();
  for (let attempts = 0; attempts < 5; attempts++) {
    const [existing] = await db.select().from(classesTable).where(eq(classesTable.joinCode, joinCode));
    if (!existing) break;
    joinCode = generateJoinCode();
  }

  const [cls] = await db
    .insert(classesTable)
    .values({ ...parsed.data, teacherId: req.teacher!.id, teacherName: req.teacher!.name, joinCode })
    .returning();

  // Chi crea la classe ne diventa coordinatore.
  await db
    .insert(classTeachersTable)
    .values({ classId: cls.id, teacherId: req.teacher!.id, role: "coordinatore" })
    .onConflictDoNothing();

  res.status(201).json(CreateClassResponse.parse({ ...cls, studentsCount: 0 }));
});

/** L'elenco degli alunni: lo vedono i docenti della classe e i suoi studenti. */
router.get("/classes/:id/students", requireAuth, async (req, res): Promise<void> => {
  const params = ListStudentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [teacher] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, req.authUserId!));

  const allowed = teacher
    ? await isClassTeacher(teacher.id, params.data.id)
    : (await studentClassIds(req.authUserId!)).includes(params.data.id);
  if (!allowed) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const rows = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.classId, params.data.id))
    .orderBy(studentsTable.name);

  res.json(ListStudentsResponse.parse(rows));
});

router.post("/classes/:id/students", requireTeacher, async (req, res): Promise<void> => {
  const params = CreateStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await isClassTeacher(req.teacher!.id, params.data.id))) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const [student] = await db
    .insert(studentsTable)
    .values({ classId: params.data.id, name: parsed.data.name, besDsa: parsed.data.besDsa ?? false })
    .returning();

  res.status(201).json(CreateStudentResponse.parse(student));
});

/**
 * Import dell'elenco alunni: si incolla la lista (una riga per studente,
 * eventualmente "Nome; BES") invece di aggiungerli uno a uno.
 *
 * Crea le anagrafiche senza account: la classe compare subito completa nel
 * registro. Quando poi lo studente si iscrive col codice, viene agganciato
 * alla sua riga per nome invece di crearne una nuova (vedi l'approvazione).
 */
const ImportStudentsSchema = z.object({
  students: z
    .array(z.object({ name: z.string().trim().min(1).max(120), besDsa: z.boolean().default(false) }))
    .min(1)
    .max(200),
});

router.post("/classes/:id/students/import", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = ImportStudentsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await isClassTeacher(req.teacher!.id, classId))) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  // Nomi gia' presenti in classe (confronto senza distinzione di maiuscole).
  const existing = await db
    .select({ name: studentsTable.name })
    .from(studentsTable)
    .where(eq(studentsTable.classId, classId));
  const present = new Set(existing.map((s) => s.name.trim().toLowerCase()));

  // Deduplica anche all'interno della lista incollata.
  const toInsert: Array<{ classId: number; name: string; besDsa: boolean }> = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const s of parsed.data.students) {
    const key = s.name.trim().toLowerCase();
    if (present.has(key) || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    toInsert.push({ classId, name: s.name.trim(), besDsa: s.besDsa });
  }

  const created = toInsert.length
    ? await db.insert(studentsTable).values(toInsert).returning()
    : [];

  res.status(201).json({ created: created.length, skipped, students: created });
});

export default router;
