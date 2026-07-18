import { Router, type IRouter } from "express";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db, teachersTable, studentsTable, classesTable, classJoinRequestsTable } from "@sillabo/db";
import {
  GetMeResponse,
  SetRoleBody,
  SetRoleResponse,
  CreateJoinRequestBody,
  CreateJoinRequestResponse,
  ListJoinRequestsResponse,
  ListMyJoinRequestsResponse,
  ApproveJoinRequestResponse,
  RejectJoinRequestResponse,
} from "@sillabo/api-zod";
import { requireAuth, requireTeacher, type AuthUser } from "../middlewares/auth";
import { updateUserMetadata } from "../lib/supabase";

const router: IRouter = Router();

async function buildMe(user: AuthUser) {
  const authUserId = user.id;
  const role = user.role;

  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.authUserId, authUserId));

  const studentRows = await db
    .select({
      id: studentsTable.id,
      classId: studentsTable.classId,
      name: studentsTable.name,
      besDsa: studentsTable.besDsa,
      createdAt: studentsTable.createdAt,
    })
    .from(studentsTable)
    .where(eq(studentsTable.authUserId, authUserId));

  const requestRows = await db
    .select({
      id: classJoinRequestsTable.id,
      classId: classJoinRequestsTable.classId,
      className: classesTable.name,
      studentName: classJoinRequestsTable.studentName,
      status: classJoinRequestsTable.status,
      createdAt: classJoinRequestsTable.createdAt,
      reviewedAt: classJoinRequestsTable.reviewedAt,
    })
    .from(classJoinRequestsTable)
    .innerJoin(classesTable, eq(classesTable.id, classJoinRequestsTable.classId))
    .where(eq(classJoinRequestsTable.authUserId, authUserId));

  return {
    role,
    teacher: teacher ?? null,
    studentMemberships: studentRows,
    joinRequests: requestRows,
  };
}

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const me = await buildMe(req.authUser!);
  res.json(GetMeResponse.parse(me));
});

router.post("/onboarding/role", requireAuth, async (req, res): Promise<void> => {
  const parsed = SetRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authUserId = req.authUserId!;
  const existingRole = req.authUser!.role;

  if (existingRole && existingRole !== parsed.data.role) {
    res.status(409).json({ error: "Il ruolo e' gia' stato impostato" });
    return;
  }

  // Salva il ruolo nei metadati dell'utente Supabase, agendo con il suo stesso token.
  try {
    await updateUserMetadata(req.accessToken!, { role: parsed.data.role });
  } catch (err) {
    req.log.error({ err }, "Failed to persist role in user metadata");
    res.status(500).json({ error: "Impossibile salvare il ruolo. Riprova." });
    return;
  }
  req.authUser = { ...req.authUser!, role: parsed.data.role };

  if (parsed.data.role === "docente") {
    const [existingTeacher] = await db
      .select()
      .from(teachersTable)
      .where(eq(teachersTable.authUserId, authUserId));

    if (!existingTeacher) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(teachersTable);
      const name = req.authUser!.name;
      const email = req.authUser!.email;

      const [teacher] = await db.insert(teachersTable).values({ authUserId, name, email }).returning();

      if (count === 0) {
        req.log.info({ teacherId: teacher.id }, "First teacher registered, claiming unowned legacy classes");
        await db
          .update(classesTable)
          .set({ teacherId: teacher.id, teacherName: name })
          .where(isNull(classesTable.teacherId));
      }
    }
  }

  const me = await buildMe(req.authUser!);
  res.json(SetRoleResponse.parse(me));
});

router.post("/join-requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateJoinRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authUserId = req.authUserId!;
  const [cls] = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.joinCode, parsed.data.joinCode.trim().toUpperCase()));

  if (!cls) {
    res.status(404).json({ error: "Codice classe non valido" });
    return;
  }

  const [existing] = await db
    .select()
    .from(classJoinRequestsTable)
    .where(
      and(
        eq(classJoinRequestsTable.classId, cls.id),
        eq(classJoinRequestsTable.authUserId, authUserId),
        inArray(classJoinRequestsTable.status, ["pending", "approved"]),
      ),
    );

  if (existing) {
    res.status(409).json({
      error:
        existing.status === "approved"
          ? "Fai gia' parte di questa classe"
          : "Hai gia' una richiesta in attesa per questa classe",
    });
    return;
  }

  const [request] = await db
    .insert(classJoinRequestsTable)
    .values({
      classId: cls.id,
      authUserId,
      studentName: parsed.data.studentName,
      status: "pending",
    })
    .returning();

  res.status(201).json(CreateJoinRequestResponse.parse({ ...request, className: cls.name }));
});

router.get("/join-requests/me", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: classJoinRequestsTable.id,
      classId: classJoinRequestsTable.classId,
      className: classesTable.name,
      studentName: classJoinRequestsTable.studentName,
      status: classJoinRequestsTable.status,
      createdAt: classJoinRequestsTable.createdAt,
      reviewedAt: classJoinRequestsTable.reviewedAt,
    })
    .from(classJoinRequestsTable)
    .innerJoin(classesTable, eq(classesTable.id, classJoinRequestsTable.classId))
    .where(eq(classJoinRequestsTable.authUserId, req.authUserId!));

  res.json(ListMyJoinRequestsResponse.parse(rows));
});

router.get("/join-requests", requireTeacher, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: classJoinRequestsTable.id,
      classId: classJoinRequestsTable.classId,
      className: classesTable.name,
      studentName: classJoinRequestsTable.studentName,
      status: classJoinRequestsTable.status,
      createdAt: classJoinRequestsTable.createdAt,
      reviewedAt: classJoinRequestsTable.reviewedAt,
    })
    .from(classJoinRequestsTable)
    .innerJoin(classesTable, eq(classesTable.id, classJoinRequestsTable.classId))
    .where(eq(classesTable.teacherId, req.teacher!.id));

  res.json(ListJoinRequestsResponse.parse(rows));
});

router.post("/join-requests/:id/approve", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [request] = await db
    .select()
    .from(classJoinRequestsTable)
    .innerJoin(classesTable, eq(classesTable.id, classJoinRequestsTable.classId))
    .where(and(eq(classJoinRequestsTable.id, id), eq(classesTable.teacherId, req.teacher!.id)));

  if (!request) {
    res.status(404).json({ error: "Richiesta non trovata" });
    return;
  }

  const joinRequest = request.class_join_requests;
  const cls = request.classes;

  if (joinRequest.status !== "pending") {
    res.status(409).json({ error: "Questa richiesta e' gia' stata gestita" });
    return;
  }

  let [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.classId, cls.id), eq(studentsTable.authUserId, joinRequest.authUserId)));

  if (!student) {
    [student] = await db
      .insert(studentsTable)
      .values({ classId: cls.id, authUserId: joinRequest.authUserId, name: joinRequest.studentName })
      .returning();
  }

  const [updated] = await db
    .update(classJoinRequestsTable)
    .set({ status: "approved", reviewedAt: new Date(), studentId: student.id })
    .where(eq(classJoinRequestsTable.id, id))
    .returning();

  res.json(ApproveJoinRequestResponse.parse({ ...updated, className: cls.name }));
});

router.post("/join-requests/:id/reject", requireTeacher, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id non valido" });
    return;
  }

  const [request] = await db
    .select()
    .from(classJoinRequestsTable)
    .innerJoin(classesTable, eq(classesTable.id, classJoinRequestsTable.classId))
    .where(and(eq(classJoinRequestsTable.id, id), eq(classesTable.teacherId, req.teacher!.id)));

  if (!request) {
    res.status(404).json({ error: "Richiesta non trovata" });
    return;
  }

  const joinRequest = request.class_join_requests;
  const cls = request.classes;

  if (joinRequest.status !== "pending") {
    res.status(409).json({ error: "Questa richiesta e' gia' stata gestita" });
    return;
  }

  const [updated] = await db
    .update(classJoinRequestsTable)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(classJoinRequestsTable.id, id))
    .returning();

  res.json(RejectJoinRequestResponse.parse({ ...updated, className: cls.name }));
});

export default router;
