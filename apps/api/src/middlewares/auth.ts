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
  /** Auto-dichiarazione BES/DSA (profilo studente), letta dai metadati utente. */
  besDsa: boolean;
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

/**
 * Cache della verifica del token.
 *
 * Validare un token significa chiamare Supabase Auth via HTTPS: un viaggio di
 * rete prima ancora di toccare il database. Una schermata dell'app fa diverse
 * chiamate API, e ognuna ripeteva quella verifica: erano secondi di attesa
 * spesi solo per richiedersi chi fosse l'utente.
 *
 * Il token resta valido per un'ora, quindi tenerne l'esito per un minuto e'
 * prudente: al massimo un utente disconnesso continua a passare per 60 secondi.
 * Il profilo (nome, ruolo, BES/DSA) viene invalidato esplicitamente quando
 * cambia, cosi' le modifiche si vedono subito.
 */
const TOKEN_TTL_MS = 60_000;
const tokenCache = new Map<string, { user: AuthUser; expiresAt: number }>();

/** Dimentica l'esito per un token: da chiamare quando il profilo cambia. */
export function forgetCachedUser(authUserId: string): void {
  for (const [token, entry] of tokenCache) {
    if (entry.user.id === authUserId) tokenCache.delete(token);
  }
}

function cacheUser(token: string, user: AuthUser): void {
  // Tetto di sicurezza: senza, in un processo di lunga durata la mappa cresce.
  if (tokenCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of tokenCache) if (v.expiresAt < now) tokenCache.delete(k);
    if (tokenCache.size > 500) tokenCache.clear();
  }
  tokenCache.set(token, { user, expiresAt: Date.now() + TOKEN_TTL_MS });
}

async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.authUserId = cached.user.id;
    req.accessToken = token;
    req.authUser = cached.user;
    return cached.user;
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) {
    tokenCache.delete(token);
    return null;
  }

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
    besDsa: meta.bes_dsa === true,
  };
  cacheUser(token, req.authUser);
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
