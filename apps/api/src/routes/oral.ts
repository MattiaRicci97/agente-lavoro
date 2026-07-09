import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db, materialsTable, oralSessionsTable, oralMessagesTable } from "@sillabo/db";
import {
  StartOralSessionParams,
  StartOralSessionBody,
  StartOralSessionResponse,
  ListOralSessionsParams,
  ListOralSessionsResponse,
  GetOralSessionParams,
  GetOralSessionResponse,
  ReplyToOralSessionParams,
  ReplyToOralSessionBody,
  ReplyToOralSessionResponse,
} from "@sillabo/api-zod";
import { nextOralExamTurn } from "../lib/ai";
import { requireAuth, findApprovedStudentForMaterial } from "../middlewares/auth";

const router: IRouter = Router();

async function loadSessionWithMessages(sessionId: number) {
  const [session] = await db
    .select()
    .from(oralSessionsTable)
    .where(eq(oralSessionsTable.id, sessionId));

  if (!session) return null;

  const messages = await db
    .select()
    .from(oralMessagesTable)
    .where(eq(oralMessagesTable.sessionId, sessionId))
    .orderBy(asc(oralMessagesTable.id));

  return { ...session, messages };
}

router.post("/materials/:id/oral-sessions", requireAuth, async (req, res): Promise<void> => {
  const params = StartOralSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = StartOralSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, params.data.id));

  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const student = await findApprovedStudentForMaterial(req.authUserId!, material.id);
  if (!student) {
    res.status(403).json({ error: "Non sei iscritto a una classe con accesso a questo materiale" });
    return;
  }

  req.log.info({ materialId: material.id }, "Starting oral exam session");

  const [session] = await db
    .insert(oralSessionsTable)
    .values({ materialId: material.id, studentName: student.name, status: "in_corso" })
    .returning();

  const turn = await nextOralExamTurn(material.title, material.subject, material.content, []);

  const [firstMessage] = await db
    .insert(oralMessagesTable)
    .values({ sessionId: session.id, role: "examiner", content: turn.reply })
    .returning();

  res.status(201).json(
    StartOralSessionResponse.parse({
      ...session,
      messages: [firstMessage],
    }),
  );
});

router.get("/materials/:id/oral-sessions/history", requireAuth, async (req, res): Promise<void> => {
  const params = ListOralSessionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(oralSessionsTable)
    .where(eq(oralSessionsTable.materialId, params.data.id))
    .orderBy(desc(oralSessionsTable.createdAt));

  res.json(ListOralSessionsResponse.parse(rows));
});

router.get("/oral-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOralSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await loadSessionWithMessages(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Sessione non trovata" });
    return;
  }

  res.json(GetOralSessionResponse.parse(result));
});

router.post("/oral-sessions/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = ReplyToOralSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ReplyToOralSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await loadSessionWithMessages(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Sessione non trovata" });
    return;
  }

  if (existing.status === "completata") {
    res.json(GetOralSessionResponse.parse(existing));
    return;
  }

  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, existing.materialId));

  if (!material) {
    res.status(404).json({ error: "Materiale non trovato" });
    return;
  }

  const [studentMessage] = await db
    .insert(oralMessagesTable)
    .values({ sessionId: existing.id, role: "student", content: parsed.data.content })
    .returning();

  const transcript = [...existing.messages, studentMessage].map((m) => ({
    role: m.role as "examiner" | "student",
    content: m.content,
  }));

  req.log.info({ sessionId: existing.id }, "Processing next oral exam turn");

  const turn = await nextOralExamTurn(material.title, material.subject, material.content, transcript);

  const [examinerMessage] = await db
    .insert(oralMessagesTable)
    .values({ sessionId: existing.id, role: "examiner", content: turn.reply })
    .returning();

  let session = existing;
  if (turn.finished) {
    const [updated] = await db
      .update(oralSessionsTable)
      .set({ status: "completata", grade: turn.grade, feedback: turn.feedback })
      .where(eq(oralSessionsTable.id, existing.id))
      .returning();
    session = { ...updated, messages: existing.messages };
  }

  res.json(
    ReplyToOralSessionResponse.parse({
      ...session,
      messages: [...existing.messages, studentMessage, examinerMessage],
    }),
  );
});

export default router;
