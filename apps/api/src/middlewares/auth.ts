import type { Request, Response, NextFunction } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, teachersTable, studentsTable, materialClassesTable, type Teacher } from "@sillabo/db";
import { supabaseAnon } from "../lib/supabase";

export type UserRole = "docente" | "studente";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUserId?: string;
      authUser?: AuthUser;
      accessToken?: string;
      teacher?: Teacher;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) return null;

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const email = data.user.email ?? "";
  const metaName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const role = meta.role === "docente" || meta.role === "studente" ? meta.role : null;

  req.authUserId = data.user.id;
  req.accessToken = token;
  req.authUser = {
    id: data.user.id,
    email,
    name: metaName || email || "Utente",
    role,
  };
  return req.authUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await authenticate(req);
  if (!user) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }
  next();
}

export async function requireTeacher(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await authenticate(req);
  if (!user) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }

  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.authUserId, user.id));
  if (!teacher) {
    res.status(403).json({ error: "Accesso riservato ai docenti" });
    return;
  }

  req.teacher = teacher;
  next();
}

/**
 * Finds the requesting student's own approved roster entry for a class that
 * has been assigned the given material. Returns null if the authenticated
 * user has no approved membership granting access to that material.
 */
export async function findApprovedStudentForMaterial(
  authUserId: string,
  materialId: number,
): Promise<{ id: number; name: string; classId: number } | null> {
  const links = await db
    .select({ classId: materialClassesTable.classId })
    .from(materialClassesTable)
    .where(eq(materialClassesTable.materialId, materialId));

  const classIds = links.map((l) => l.classId);
  if (!classIds.length) return null;

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.authUserId, authUserId), inArray(studentsTable.classId, classIds)));

  return student ? { id: student.id, name: student.name, classId: student.classId } : null;
}
