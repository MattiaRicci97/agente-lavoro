import { customFetch } from "@sillabo/api-client-react";
import { isNativeApp } from "./native";

/** Il token di notifica di questo telefono, noto dopo la registrazione. */
let currentToken: string | null = null;

export function setDeviceToken(token: string): void {
  currentToken = token;
}

/** Da chiamare prima di uscire dall'account: il telefono smette di ricevere le sue notifiche. */
export async function unregisterDevice(): Promise<void> {
  if (!isNativeApp || !currentToken) return;
  try {
    await customFetch("/api/me/devices/unregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: currentToken }),
    });
  } catch {
    // Se non riesce, il token passera' al prossimo utente che accede da questo telefono.
  }
  currentToken = null;
}
