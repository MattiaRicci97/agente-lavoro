import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
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
