import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const FALLBACK = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>WorkInProgress HQ</title></head><body style="font-family:sans-serif;background:#0B1626;color:#EAF2FA;display:flex;align-items:center;justify-content:center;min-height:100vh"><p>WorkInProgress HQ &mdash; interfaccia non ancora caricata.</p></body></html>`;

Deno.serve(async () => {
  const { data } = await db.from("settings").select("value").eq("key", "app_html").maybeSingle();
  return new Response(data?.value ?? FALLBACK, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
    },
  });
});
