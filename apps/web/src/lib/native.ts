import { Capacitor } from "@capacitor/core";

/**
 * Siamo dentro l'app per telefono (Android/iOS) o nel browser?
 * Le poche cose che cambiano (voce, fotocamera, download, notifiche) passano
 * da qui; tutto il resto e' lo stesso codice del portale.
 */
export const isNativeApp = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform() as "android" | "ios" | "web";

/**
 * L'indirizzo pubblico del portale: dentro l'app window.location e' interno
 * (https://localhost), quindi i link da condividere (es. inviti) usano questo.
 */
export function publicOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  return (configured || window.location.origin).replace(/\/+$/, "");
}
