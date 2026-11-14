import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, deviceTokensTable } from "@sillabo/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const DeviceBody = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios"]),
});

/**
 * L'app registra il telefono per ricevere le notifiche. Se lo stesso telefono
 * passa a un altro utente (cambio di account), il token passa con lui.
 */
router.post("/me/devices", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date();
  await db
    .insert(deviceTokensTable)
    .values({ authUserId: req.authUserId!, token: parsed.data.token, platform: parsed.data.platform })
    .onConflictDoUpdate({
      target: deviceTokensTable.token,
      set: { authUserId: req.authUserId!, platform: parsed.data.platform, lastSeenAt: now },
    });
  res.status(204).end();
});

/** All'uscita dall'account il telefono smette di ricevere le notifiche di quell'utente. */
router.post("/me/devices/unregister", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeviceBody.pick({ token: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .delete(deviceTokensTable)
    .where(and(eq(deviceTokensTable.token, parsed.data.token), eq(deviceTokensTable.authUserId, req.authUserId!)));
  res.status(204).end();
});

export default router;
