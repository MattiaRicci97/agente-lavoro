import { createSign } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, deviceTokensTable, studentsTable } from "@sillabo/db";
import { logger } from "./logger";

/**
 * Notifiche push sui telefoni, tramite Firebase Cloud Messaging (FCM v1).
 *
 * Si accendono solo se e' impostata FIREBASE_SERVICE_ACCOUNT (il JSON della
 * chiave di servizio del progetto Firebase). Senza, ogni invio e' un no-op:
 * le notifiche restano comunque visibili dentro l'app, come oggi.
 *
 * Il testo di una notifica e' sempre generico e non contiene voti o giudizi:
 * la schermata di blocco del telefono non e' un luogo privato.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Percorso dell'app da aprire al tocco, es. "/studio/lampo". */
  link?: string;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedAccount: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return (cachedAccount = null);
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    cachedAccount = parsed.project_id && parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    logger.error("FIREBASE_SERVICE_ACCOUNT non e' un JSON valido: notifiche push disattivate");
    cachedAccount = null;
  }
  return cachedAccount;
}

export function pushEnabled(): boolean {
  return serviceAccount() !== null;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** JWT firmato con la chiave di servizio, da scambiare con un token OAuth di Google. */
export function signServiceJwt(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key).toString("base64url")}`;
}

let accessToken: { value: string; expiresAt: number } | null = null;
async function googleAccessToken(account: ServiceAccount): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signServiceJwt(account),
    }),
  });
  if (!res.ok) throw new Error(`OAuth Google non riuscito (HTTP ${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return accessToken.value;
}

/** Il corpo del messaggio FCM v1 per un dispositivo. */
export function fcmMessage(token: string, message: PushMessage) {
  return {
    message: {
      token,
      notification: { title: message.title, body: message.body },
      data: message.link ? { link: message.link } : {},
      android: { priority: "high", notification: { channel_id: "sillabo" } },
    },
  };
}

/** Invia a tutti i dispositivi degli utenti indicati. Non lancia mai: e' un di piu'. */
export async function pushToUsers(authUserIds: string[], message: PushMessage): Promise<number> {
  const account = serviceAccount();
  const ids = Array.from(new Set(authUserIds.filter(Boolean)));
  if (!account || !ids.length) return 0;
  try {
    const devices = await db.select().from(deviceTokensTable).where(inArray(deviceTokensTable.authUserId, ids));
    if (!devices.length) return 0;
    const bearer = await googleAccessToken(account);
    let sent = 0;
    await Promise.all(
      devices.map(async (d) => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify(fcmMessage(d.token, message)),
        });
        if (res.ok) {
          sent += 1;
          return;
        }
        // App disinstallata o token scaduto: il dispositivo non serve piu'.
        if (res.status === 404 || res.status === 400) {
          const text = await res.text();
          if (/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(text)) {
            await db.delete(deviceTokensTable).where(eq(deviceTokensTable.id, d.id));
          }
        }
      }),
    );
    return sent;
  } catch (err) {
    logger.error({ err }, "Invio notifiche push non riuscito");
    return 0;
  }
}

/** Come pushToUsers, partendo dalle righe studente. */
export async function pushToStudents(studentIds: number[], message: PushMessage): Promise<number> {
  if (!pushEnabled() || !studentIds.length) return 0;
  const rows = await db
    .select({ authUserId: studentsTable.authUserId })
    .from(studentsTable)
    .where(inArray(studentsTable.id, studentIds));
  return pushToUsers(rows.map((r) => r.authUserId).filter((x): x is string => !!x), message);
}

/** Agli studenti delle classi indicate. */
export async function pushToClasses(classIds: number[], message: PushMessage): Promise<number> {
  if (!pushEnabled() || !classIds.length) return 0;
  const rows = await db
    .select({ authUserId: studentsTable.authUserId })
    .from(studentsTable)
    .where(inArray(studentsTable.classId, classIds));
  return pushToUsers(rows.map((r) => r.authUserId).filter((x): x is string => !!x), message);
}

/** Per i test: dimentica la configurazione letta. */
export function resetPushConfig(): void {
  cachedAccount = undefined;
  accessToken = null;
}
