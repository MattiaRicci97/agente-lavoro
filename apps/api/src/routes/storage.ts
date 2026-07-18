import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@sillabo/api-zod";
import { requireAuth } from "../middlewares/auth";
import { createUploadUrl, downloadObject, ObjectNotFoundError } from "../lib/storage";

const router: IRouter = Router();

/**
 * POST /storage/uploads/request-url
 *
 * Richiede un URL firmato per caricare un file.
 * Il client invia solo i metadati (name, size, contentType) — NON il file.
 * Poi carica il file direttamente sull'URL firmato restituito (bucket Supabase).
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const { uploadURL, objectPath } = await createUploadUrl(req.accessToken!, name);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve i file caricati (bucket privato Supabase), solo a utenti autenticati.
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const buffer = await downloadObject(req.accessToken!, objectPath);

    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("cache-control", "private, max-age=3600");
    res.send(buffer);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
