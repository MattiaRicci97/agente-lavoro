import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, count, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  classesTable,
  studentsTable,
  classPostsTable,
  classPostReadsTable,
  classPostCommentsTable,
  teachersTable,
} from "@sillabo/db";
import { requireAuth, requireTeacher } from "../middlewares/auth";
import { draftClassNotice } from "../lib/ai";
import { teacherClassIds, isClassTeacher } from "../lib/classAccess";

const router: IRouter = Router();

const KINDS = ["avviso", "compito", "materiale", "verifica"] as const;

const CreatePostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(5000).default(""),
  kind: z.enum(KINDS).default("avviso"),
  pinned: z.boolean().default(false),
  commentsEnabled: z.boolean().default(true),
  aiAssisted: z.boolean().default(false),
  /** Pubblica lo stesso avviso anche sulle altre classi indicate. */
  alsoClassIds: z.array(z.number().int().positive()).max(20).default([]),
});

const UpdatePostSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(5000).optional(),
  pinned: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
});

const CommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

const DraftSchema = z.object({
  classId: z.number().int().positive(),
  hint: z.string().trim().min(3).max(1000),
});

/** Iscrizioni dello studente autenticato. */
async function studentMemberships(authUserId: string) {
  return db
    .select({ classId: studentsTable.classId, name: studentsTable.name })
    .from(studentsTable)
    .where(eq(studentsTable.authUserId, authUserId));
}

/** Chi sta guardando la bacheca, e con quali classi. */
async function viewer(req: { authUserId?: string }): Promise<
  | { role: "docente"; teacherId: number; classIds: number[]; name: string }
  | { role: "studente"; classIds: number[]; name: string }
  | null
> {
  const [teacher] = await db
    .select()
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, req.authUserId!));
  if (teacher) {
    return {
      role: "docente",
      teacherId: teacher.id,
      classIds: await teacherClassIds(teacher.id),
      name: teacher.name,
    };
  }

  const memberships = await studentMemberships(req.authUserId!);
  if (!memberships.length) return null;
  return {
    role: "studente",
    classIds: memberships.map((m) => m.classId),
    name: memberships[0].name,
  };
}

/** Avvisi con i conteggi di lettura e di risposte, ordinati con i fissati in cima. */
async function loadPosts(classIds: number[], authUserId: string, isTeacher: boolean) {
  if (!classIds.length) return [];

  const posts = await db
    .select({
      id: classPostsTable.id,
      classId: classPostsTable.classId,
      authorName: classPostsTable.authorName,
      kind: classPostsTable.kind,
      title: classPostsTable.title,
      body: classPostsTable.body,
      pinned: classPostsTable.pinned,
      commentsEnabled: classPostsTable.commentsEnabled,
      materialId: classPostsTable.materialId,
      writtenExamId: classPostsTable.writtenExamId,
      examDateId: classPostsTable.examDateId,
      aiAssisted: classPostsTable.aiAssisted,
      createdAt: classPostsTable.createdAt,
      className: classesTable.name,
    })
    .from(classPostsTable)
    .innerJoin(classesTable, eq(classesTable.id, classPostsTable.classId))
    .where(inArray(classPostsTable.classId, classIds))
    .orderBy(desc(classPostsTable.pinned), desc(classPostsTable.createdAt))
    .limit(100);

  if (!posts.length) return [];
  const postIds = posts.map((p) => p.id);

  const reads = await db
    .select({ postId: classPostReadsTable.postId, readers: count() })
    .from(classPostReadsTable)
    .where(inArray(classPostReadsTable.postId, postIds))
    .groupBy(classPostReadsTable.postId);
  const readersByPost = new Map(reads.map((r) => [r.postId, r.readers]));

  const comments = await db
    .select({ postId: classPostCommentsTable.postId, total: count() })
    .from(classPostCommentsTable)
    .where(inArray(classPostCommentsTable.postId, postIds))
    .groupBy(classPostCommentsTable.postId);
  const commentsByPost = new Map(comments.map((c) => [c.postId, c.total]));

  // Quanti studenti dovrebbero leggere ciascun avviso.
  const rosters = await db
    .select({ classId: studentsTable.classId, total: count() })
    .from(studentsTable)
    .where(inArray(studentsTable.classId, classIds))
    .groupBy(studentsTable.classId);
  const rosterByClass = new Map(rosters.map((r) => [r.classId, r.total]));

  // Cosa ha gia' letto chi sta guardando.
  const mine = await db
    .select({ postId: classPostReadsTable.postId })
    .from(classPostReadsTable)
    .where(
      and(
        inArray(classPostReadsTable.postId, postIds),
        eq(classPostReadsTable.authUserId, authUserId),
      ),
    );
  const readByMe = new Set(mine.map((m) => m.postId));

  return posts.map((p) => ({
    ...p,
    commentsCount: commentsByPost.get(p.id) ?? 0,
    readByMe: readByMe.has(p.id),
    // Il conteggio delle letture serve al docente; allo studente non interessa
    // sapere chi altro ha letto, e non deve nemmeno vederlo.
    ...(isTeacher
      ? {
          readCount: readersByPost.get(p.id) ?? 0,
          studentsCount: rosterByClass.get(p.classId) ?? 0,
        }
      : {}),
  }));
}

/** Bacheca di tutte le classi dell'utente. */
router.get("/class-posts/feed", requireAuth, async (req, res): Promise<void> => {
  const who = await viewer(req);
  if (!who) {
    res.json({ posts: [], classes: [] });
    return;
  }

  const classes = who.classIds.length
    ? await db
        .select({ id: classesTable.id, name: classesTable.name, gradeLevel: classesTable.gradeLevel })
        .from(classesTable)
        .where(inArray(classesTable.id, who.classIds))
        .orderBy(classesTable.name)
    : [];

  res.json({
    role: who.role,
    classes,
    posts: await loadPosts(who.classIds, req.authUserId!, who.role === "docente"),
  });
});

/** Numero di avvisi non ancora letti (per la pastiglia nel menu). */
router.get("/class-posts/unread-count", requireAuth, async (req, res): Promise<void> => {
  const memberships = await studentMemberships(req.authUserId!);
  if (!memberships.length) {
    res.json({ unread: 0 });
    return;
  }

  const [row] = await db
    .select({ unread: count() })
    .from(classPostsTable)
    .where(
      and(
        inArray(
          classPostsTable.classId,
          memberships.map((m) => m.classId),
        ),
        sql`not exists (
          select 1 from class_post_reads r
          where r.post_id = ${classPostsTable.id} and r.auth_user_id = ${req.authUserId!}
        )`,
      ),
    );

  res.json({ unread: row?.unread ?? 0 });
});

/** Il docente pubblica un avviso (eventualmente su piu' classi in una volta). */
router.post("/classes/:id/posts", requireTeacher, async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const mine = await teacherClassIds(req.teacher!.id);
  const targets = Array.from(new Set([classId, ...parsed.data.alsoClassIds]));
  const notMine = targets.filter((id) => !mine.includes(id));
  if (notMine.length) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  const created = await db
    .insert(classPostsTable)
    .values(
      targets.map((id) => ({
        classId: id,
        teacherId: req.teacher!.id,
        authorName: req.teacher!.name,
        kind: parsed.data.kind,
        title: parsed.data.title,
        body: parsed.data.body,
        pinned: parsed.data.pinned,
        commentsEnabled: parsed.data.commentsEnabled,
        aiAssisted: parsed.data.aiAssisted,
      })),
    )
    .returning();

  res.status(201).json(created);
});

/** Il docente modifica un proprio avviso (testo, fissaggio, risposte aperte). */
router.patch("/class-posts/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = UpdatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const mine = await teacherClassIds(req.teacher!.id);
  const [post] = mine.length
    ? await db
        .select()
        .from(classPostsTable)
        .where(and(eq(classPostsTable.id, id), inArray(classPostsTable.classId, mine)))
    : [];
  if (!post) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }

  const [updated] = await db
    .update(classPostsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(classPostsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/class-posts/:id", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const mine = await teacherClassIds(req.teacher!.id);
  const [post] = mine.length
    ? await db
        .select()
        .from(classPostsTable)
        .where(and(eq(classPostsTable.id, id), inArray(classPostsTable.classId, mine)))
    : [];
  if (!post) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }

  await db.delete(classPostsTable).where(eq(classPostsTable.id, id));
  res.status(204).end();
});

/** Lo studente segna l'avviso come letto. */
router.post("/class-posts/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const memberships = await studentMemberships(req.authUserId!);
  const [post] = memberships.length
    ? await db
        .select()
        .from(classPostsTable)
        .where(
          and(
            eq(classPostsTable.id, id),
            inArray(
              classPostsTable.classId,
              memberships.map((m) => m.classId),
            ),
          ),
        )
    : [];
  if (!post) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }

  const membership = memberships.find((m) => m.classId === post.classId)!;
  await db
    .insert(classPostReadsTable)
    .values({ postId: id, authUserId: req.authUserId!, studentName: membership.name })
    .onConflictDoNothing();

  res.status(204).end();
});

/** Il docente vede chi ha letto e chi no: serve per sapere chi richiamare. */
router.get("/class-posts/:id/readers", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const mine = await teacherClassIds(req.teacher!.id);
  const [post] = mine.length
    ? await db
        .select()
        .from(classPostsTable)
        .where(and(eq(classPostsTable.id, id), inArray(classPostsTable.classId, mine)))
    : [];
  if (!post) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }

  const roster = await db
    .select({ name: studentsTable.name, authUserId: studentsTable.authUserId })
    .from(studentsTable)
    .where(eq(studentsTable.classId, post.classId))
    .orderBy(studentsTable.name);

  const reads = await db
    .select({ authUserId: classPostReadsTable.authUserId, readAt: classPostReadsTable.readAt })
    .from(classPostReadsTable)
    .where(eq(classPostReadsTable.postId, id));
  const readAtByUser = new Map(reads.map((r) => [r.authUserId, r.readAt]));

  const students = roster.map((s) => ({
    name: s.name,
    readAt: s.authUserId ? (readAtByUser.get(s.authUserId) ?? null) : null,
  }));

  res.json({
    students,
    readCount: students.filter((s) => s.readAt).length,
    studentsCount: students.length,
  });
});

/** Le domande sotto un avviso: le legge chi è della classe o ne è il docente. */
router.get("/class-posts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const who = await viewer(req);
  const [post] = who?.classIds.length
    ? await db
        .select()
        .from(classPostsTable)
        .where(and(eq(classPostsTable.id, id), inArray(classPostsTable.classId, who.classIds)))
    : [];
  if (!post) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }

  const rows = await db
    .select()
    .from(classPostCommentsTable)
    .where(eq(classPostCommentsTable.postId, id))
    .orderBy(classPostCommentsTable.createdAt);

  res.json(rows);
});

/**
 * Domanda dello studente o risposta del docente.
 * Qui non c'e' nessuna risposta automatica: e' una conversazione fra persone.
 */
router.post("/class-posts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }
  const parsed = CommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const who = await viewer(req);
  const [post] = who?.classIds.length
    ? await db
        .select()
        .from(classPostsTable)
        .where(and(eq(classPostsTable.id, id), inArray(classPostsTable.classId, who.classIds)))
    : [];
  if (!post || !who) {
    res.status(404).json({ error: "Avviso non trovato" });
    return;
  }
  if (!post.commentsEnabled && who.role === "studente") {
    res.status(403).json({ error: "Il docente ha chiuso le risposte su questo avviso" });
    return;
  }

  const [created] = await db
    .insert(classPostCommentsTable)
    .values({
      postId: id,
      authUserId: req.authUserId!,
      authorName: who.name,
      authorRole: who.role,
      body: parsed.data.body,
    })
    .returning();

  res.status(201).json(created);
});

/**
 * Bozza assistita: il docente butta giu' due parole, l'assistente prepara il
 * testo. Non viene pubblicato nulla: torna al docente, che decide.
 */
router.post("/class-posts/draft", requireTeacher, async (req, res): Promise<void> => {
  const parsed = DraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [cls] = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.id, parsed.data.classId));
  if (!cls || !(await isClassTeacher(req.teacher!.id, parsed.data.classId))) {
    res.status(404).json({ error: "Classe non trovata" });
    return;
  }

  try {
    const draft = await draftClassNotice(parsed.data.hint, cls.name, req.teacher!.name);
    res.json({ ...draft, aiAssisted: true });
  } catch (err) {
    req.log.error({ err }, "Draft avviso fallito");
    res.status(500).json({ error: "Non sono riuscito a preparare la bozza. Riprova o scrivila a mano." });
  }
});

export default router;
