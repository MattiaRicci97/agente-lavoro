import { Router, type IRouter } from "express";
import { pool } from "@sillabo/db";

const router: IRouter = Router();

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // Estrae solo l'host (niente password) da una connection string postgres.
    return new URL(url).host;
  } catch {
    return "non-analizzabile";
  }
}

/**
 * Pagina di diagnosi (nessun segreto esposto): verifica che le variabili
 * d'ambiente ci siano e che il database sia raggiungibile dalla funzione.
 * Da rimuovere una volta risolto il deploy.
 */
router.get("/debug", async (_req, res): Promise<void> => {
  const started = Date.now();
  const out: Record<string, unknown> = {
    env: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      DATABASE_URL: !!process.env.DATABASE_URL,
    },
    dbHost: hostOf(process.env.DATABASE_URL),
  };

  try {
    const ping = await Promise.race([
      pool.query("select 1 as ok"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout dopo 8s")), 8000)),
    ]);
    out.db = (ping as { rows?: unknown[] })?.rows ? "ok" : "risposta inattesa";
  } catch (err) {
    out.db = "ERRORE";
    out.dbError = err instanceof Error ? err.message : String(err);
  }

  out.tookMs = Date.now() - started;
  res.json(out);
});

export default router;
