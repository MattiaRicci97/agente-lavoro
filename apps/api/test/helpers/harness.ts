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
  /**
   * Decide cosa "risponde il modello" alla prossima chiamata Anthropic: il
   * testo viene restituito come unico blocco. Senza una risposta impostata la
   * chiamata fallisce con 500, come farebbe un servizio non raggiungibile.
   */
  anthropicReplies(fn: (request: { system?: string; messages: unknown[] }) => string): void;
  /** Le richieste ricevute dal finto Anthropic, per controllare cosa e' stato inviato. */
  anthropicRequests: Array<{ system?: string; messages: unknown[] }>;
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

  // Anthropic finto: l'SDK rispetta ANTHROPIC_BASE_URL, quindi l'API vera
  // parla con questo server senza saperlo.
  let reply: ((request: { system?: string; messages: unknown[] }) => string) | null = null;
  const anthropicRequests: Array<{ system?: string; messages: unknown[] }> = [];
  const anthropic = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404);
        res.end();
        return;
      }
      const parsed = JSON.parse(body || "{}") as { system?: string; messages: unknown[] };
      anthropicRequests.push(parsed);
      if (!reply) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "nessuna risposta impostata nel test" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "test",
          content: [{ type: "text", text: reply(parsed) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => anthropic.listen(0, "127.0.0.1", resolve));
  const anthropicPort = (anthropic.address() as AddressInfo).port;

  process.env.SUPABASE_URL = `http://127.0.0.1:${gotruePort}`;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = databaseUrl;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${anthropicPort}`;

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
    anthropicReplies(fn) {
      reply = fn;
    },
    anthropicRequests,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => gotrue.close(() => resolve()));
      await new Promise<void>((resolve) => anthropic.close(() => resolve()));
      const { pool } = await import("@sillabo/db");
      await pool.end();
    },
  };
}
