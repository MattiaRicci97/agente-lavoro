import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Non blocchiamo l'avvio del server se manca la variabile: le query
// falliranno con un errore chiaro (utile in serverless per la diagnosi).
if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL non impostata: le query al database falliranno.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // In serverless piu' istanze condividono il pooler di Supabase:
  // teniamo poche connessioni per istanza per non esaurirlo.
  max: Number(process.env.PG_POOL_MAX ?? 5),
  // Se il database non e' raggiungibile, fallisci in fretta invece di
  // restare appeso all'infinito (in serverless bloccherebbe la richiesta).
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 10000),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
