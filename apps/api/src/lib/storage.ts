import { randomUUID } from "node:crypto";
import { supabaseForUser, STORAGE_BUCKET } from "./supabase";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

const OBJECT_PATH_PREFIX = "/objects/";

/** Converte il percorso pubblico dell'app ("/objects/<key>") nella chiave del bucket. */
export function objectPathToKey(objectPath: string): string {
  if (!objectPath.startsWith(OBJECT_PATH_PREFIX)) {
    throw new ObjectNotFoundError();
  }
  const key = objectPath.slice(OBJECT_PATH_PREFIX.length);
  if (!key || key.includes("..")) {
    throw new ObjectNotFoundError();
  }
  return key;
}

function sanitizeFileName(name: string): string {
  const base = name.split("/").pop() ?? "file";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

/**
 * Genera un URL firmato per l'upload diretto dal browser al bucket Supabase.
 * L'operazione avviene per conto dell'utente autenticato (policy RLS).
 */
export async function createUploadUrl(
  accessToken: string,
  fileName: string,
): Promise<{ uploadURL: string; objectPath: string }> {
  const key = `uploads/${randomUUID()}/${sanitizeFileName(fileName)}`;
  const supabase = supabaseForUser(accessToken);

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    throw new Error(`Impossibile creare l'URL di upload: ${error?.message ?? "risposta vuota"}`);
  }

  return { uploadURL: data.signedUrl, objectPath: `${OBJECT_PATH_PREFIX}${key}` };
}

/** Scarica un oggetto dal bucket per conto dell'utente autenticato. */
export async function downloadObject(accessToken: string, objectPath: string): Promise<Buffer> {
  const key = objectPathToKey(objectPath);
  const supabase = supabaseForUser(accessToken);

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(key);
  if (error || !data) {
    throw new ObjectNotFoundError();
  }
  return Buffer.from(await data.arrayBuffer());
}
