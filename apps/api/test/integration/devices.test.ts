import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { startHarness, type Harness } from "../helpers/harness";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("Telefoni e notifiche push", () => {
  let h: Harness;
  let sql: typeof import("drizzle-orm").sql;
  let db: typeof import("@sillabo/db").db;
  let push: typeof import("../../src/lib/push");
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const tokenA = `device-token-a-${run}-xxxxxxxxxxxx`;
  const tokenB = `device-token-b-${run}-xxxxxxxxxxxx`;
  const tokens: Record<string, string> = {};
  const sentToGoogle: Array<{ url: string; body: string }> = [];

  beforeAll(async () => {
    h = await startHarness();
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("@sillabo/db"));
    push = await import("../../src/lib/push");
    tokens.anna = h.tokenFor({ id: `da-${run}`, email: "a@t.it", role: "studente", name: "Anna" });
    tokens.bruno = h.tokenFor({ id: `db-${run}`, email: "b@t.it", role: "studente", name: "Bruno" });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    push?.resetPushConfig();
    if (!h) return;
    await db.execute(sql`DELETE FROM device_tokens WHERE auth_user_id IN (${`da-${run}`}, ${`db-${run}`})`);
    await h.stop();
  });

  it("RLS e' abilitata sulla tabella dei dispositivi", async () => {
    const [row] = (await db.execute(sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'device_tokens'`)).rows as Array<{ relrowsecurity: boolean }>;
    expect(row.relrowsecurity).toBe(true);
  });

  it("registra il telefono dell'utente; se cambia account, il token passa al nuovo utente", async () => {
    expect((await h.api("/me/devices", { method: "POST", json: { token: tokenA, platform: "android" } })).status).toBe(401);
    expect((await h.api("/me/devices", { method: "POST", token: tokens.anna, json: { token: "corto", platform: "android" } })).status).toBe(400);
    expect((await h.api("/me/devices", { method: "POST", token: tokens.anna, json: { token: tokenA, platform: "android" } })).status).toBe(204);
    expect((await h.api("/me/devices", { method: "POST", token: tokens.anna, json: { token: tokenA, platform: "android" } })).status).toBe(204);
    let rows = (await db.execute(sql`SELECT auth_user_id FROM device_tokens WHERE token = ${tokenA}`)).rows as Array<{ auth_user_id: string }>;
    expect(rows).toEqual([{ auth_user_id: `da-${run}` }]);

    await h.api("/me/devices", { method: "POST", token: tokens.bruno, json: { token: tokenA, platform: "android" } });
    rows = (await db.execute(sql`SELECT auth_user_id FROM device_tokens WHERE token = ${tokenA}`)).rows as Array<{ auth_user_id: string }>;
    expect(rows).toEqual([{ auth_user_id: `db-${run}` }]);

    // Un altro utente non puo' sganciare il telefono di Bruno.
    await h.api("/me/devices/unregister", { method: "POST", token: tokens.anna, json: { token: tokenA } });
    expect((await db.execute(sql`SELECT 1 FROM device_tokens WHERE token = ${tokenA}`)).rows).toHaveLength(1);
    expect((await h.api("/me/devices/unregister", { method: "POST", token: tokens.bruno, json: { token: tokenA } })).status).toBe(204);
    expect((await db.execute(sql`SELECT 1 FROM device_tokens WHERE token = ${tokenA}`)).rows).toHaveLength(0);
  });

  it("senza configurazione Firebase non invia nulla e non fallisce", async () => {
    push.resetPushConfig();
    expect(await push.pushToUsers([`da-${run}`], { title: "x", body: "y" })).toBe(0);
  });

  it("con Firebase configurato invia a ogni telefono e dimentica quelli non piu' registrati", async () => {
    await h.api("/me/devices", { method: "POST", token: tokens.anna, json: { token: tokenA, platform: "android" } });
    await h.api("/me/devices", { method: "POST", token: tokens.anna, json: { token: tokenB, platform: "ios" } });
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: "sillabo-test",
      client_email: "push@sillabo-test.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    });
    push.resetPushConfig();

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("https://oauth2.googleapis.com/")) {
        return new Response(JSON.stringify({ access_token: "google-token", expires_in: 3600 }), { status: 200 });
      }
      if (url.startsWith("https://fcm.googleapis.com/")) {
        const body = String(init?.body ?? "");
        sentToGoogle.push({ url, body });
        return body.includes(tokenB)
          ? new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 })
          : new Response("{}", { status: 200 });
      }
      return realFetch(input, init);
    });

    const sent = await push.pushToUsers([`da-${run}`], { title: "Correzione firmata", body: "Trovi l'esito in Sillabo.", link: "/studio" });
    vi.unstubAllGlobals();
    expect(sent).toBe(1);
    expect(sentToGoogle).toHaveLength(2);
    expect(sentToGoogle[0].url).toBe("https://fcm.googleapis.com/v1/projects/sillabo-test/messages:send");
    expect(sentToGoogle.map((s) => JSON.parse(s.body).message.notification.title)).toEqual(["Correzione firmata", "Correzione firmata"]);
    const left = (await db.execute(sql`SELECT token FROM device_tokens WHERE auth_user_id = ${`da-${run}`}`)).rows as Array<{ token: string }>;
    expect(left.map((r) => r.token)).toEqual([tokenA]);
  });
});
