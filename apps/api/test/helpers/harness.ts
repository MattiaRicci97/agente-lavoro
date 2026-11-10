import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Banco di prova per i test d'integrazione.
 *
 * Supabase Auth viene sostituito da un piccolo server HTTP che risponde a
 * GET /auth/v1/user con l'utente associato al bearer token: cosi' l'API vera
 * gira senza chiavi e senza rete, e ogni test decide "chi" sta chiamando.
 * Il database e' quello indicato da TEST_DATABASE_URL.
 */

export interface FakeUser {
  id: string;
  email: string;
  role: "docente" | "studente";
  name: string;
}

export interface Harness {
  baseUrl: string;
  /** Registra un utente finto e restituisce il token da usare come Bearer. */
  tokenFor(user: FakeUser): string;
  api(path: string, init?: RequestInit & { token?: string; json?: unknown }): Promise<Response>;
  stop(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL non impostata");

  const users = new Map<string, FakeUser>();

  const gotrue = http.createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/auth/v1/user")) {
      const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const user = users.get(token);
      if (!user) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "invalid token", code: 401 }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: user.id,
          aud: "authenticated",
          email: user.email,
          app_metadata: {},
          user_metadata: { role: user.role, full_name: user.name },
          created_at: new Date().toISOString(),
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => gotrue.listen(0, "127.0.0.1", resolve));
  const gotruePort = (gotrue.address() as AddressInfo).port;

  process.env.SUPABASE_URL = `http://127.0.0.1:${gotruePort}`;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.ANTHROPIC_API_KEY;

  // Import dinamico: le variabili d'ambiente devono esistere PRIMA che i moduli
  // dell'API le leggano al caricamento.
  const { default: app } = await import("../../src/app");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    tokenFor(user) {
      const token = `tok-${user.id}`;
      users.set(token, user);
      return token;
    },
    async api(path, init = {}) {
      const { token, json, headers, ...rest } = init;
      return fetch(`${baseUrl}/api${path}`, {
        ...rest,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(json !== undefined ? { "content-type": "application/json" } : {}),
          ...(headers as Record<string, string> | undefined),
        },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
      });
    },
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => gotrue.close(() => resolve()));
      const { pool } = await import("@sillabo/db");
      await pool.end();
    },
  };
}
