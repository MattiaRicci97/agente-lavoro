import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, classesTable, studentsTable } from "@sillabo/db";
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

const router: IRouter = Router();

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

router.get("/classes", requireTeacher, async (req, res): Promise<void> => {
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
    .where(eq(classesTable.teacherId, req.teacher!.id))
    .groupBy(classesTable.id)
    .orderBy(classesTable.id);

  res.json(ListClassesResponse.parse(rows));
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
  res.status(201).json(CreateClassResponse.parse({ ...cls, studentsCount: 0 }));
});

router.get("/classes/:id/students", requireAuth, async (req, res): Promise<void> => {
  const params = ListStudentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  const [student] = await db
    .insert(studentsTable)
    .values({ classId: params.data.id, name: parsed.data.name, besDsa: parsed.data.besDsa ?? false })
    .returning();

  res.status(201).json(CreateStudentResponse.parse(student));
});

export default router;
