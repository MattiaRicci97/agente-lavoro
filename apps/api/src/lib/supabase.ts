import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_ANON_KEY devono essere impostate (vedi .env.example nella radice del repo)",
  );
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Client anonimo: usato solo per validare i token degli utenti. */
export const supabaseAnon: SupabaseClient = createClient(url, anonKey, noSession);

/**
 * Client che agisce per conto dell'utente autenticato (il suo JWT viene
 * inoltrato a Supabase): rispetta le policy RLS su storage e auth.
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(url!, anonKey!, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export const STORAGE_BUCKET = "materials";

/**
 * Aggiorna gli user_metadata dell'utente autenticato via REST GoTrue.
 * (supabase-js richiederebbe una sessione client-side che qui non esiste:
 * il server ha solo il bearer token inoltrato dal frontend.)
 */
export async function updateUserMetadata(
  accessToken: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: anonKey!,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Aggiornamento metadati utente fallito (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
}
