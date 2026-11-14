import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { signServiceJwt, fcmMessage } from "../../src/lib/push";

describe("signServiceJwt", () => {
  it("produce un JWT RS256 verificabile, con l'ambito delle notifiche Firebase", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = signServiceJwt(
      {
        project_id: "sillabo-test",
        client_email: "push@sillabo-test.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      },
      1_800_000_000,
    );
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: "push@sillabo-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("fcmMessage", () => {
  it("porta titolo, testo e la pagina da aprire, sul canale dell'app", () => {
    expect(fcmMessage("tok", { title: "T", body: "B", link: "/studio/lampo" })).toEqual({
      message: {
        token: "tok",
        notification: { title: "T", body: "B" },
        data: { link: "/studio/lampo" },
        android: { priority: "high", notification: { channel_id: "sillabo" } },
      },
    });
    expect(fcmMessage("tok", { title: "T", body: "B" }).message.data).toEqual({});
  });
});
