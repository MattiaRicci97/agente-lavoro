import { useEffect, useRef } from "react";
import { navigate } from "wouter/use-browser-location";
import { customFetch } from "@sillabo/api-client-react";
import { useAuth } from "@/lib/auth";
import { isNativeApp, nativePlatform } from "@/lib/native";
import { setDeviceToken } from "@/lib/devices";

/**
 * Il collegamento tra il portale e il telefono, attivo solo dentro l'app:
 *  - tasto "indietro" di Android: torna alla pagina precedente, poi esce;
 *  - notifiche push: dopo l'accesso chiede il permesso e registra il telefono;
 *    toccando una notifica si apre la pagina a cui si riferisce.
 *
 * Le notifiche richiedono il file di configurazione Firebase nell'app: finche'
 * non c'e', la build va fatta senza VITE_PUSH_ENABLED e qui non si registra
 * nulla (registrarsi senza Firebase farebbe chiudere l'app su Android).
 */
const PUSH_ENABLED = import.meta.env.VITE_PUSH_ENABLED === "1";

export function NativeBridge() {
  const { isSignedIn } = useAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (!isNativeApp) return;
    let remove: (() => void) | undefined;
    void import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.exitApp();
      });
      remove = () => void handle.remove();
    });
    return () => remove?.();
  }, []);

  useEffect(() => {
    if (!isNativeApp || !PUSH_ENABLED || !isSignedIn || registered.current) return;
    registered.current = true;
    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.removeAllListeners();
      await PushNotifications.addListener("registration", async ({ value }) => {
        setDeviceToken(value);
        try {
          await customFetch("/api/me/devices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: value, platform: nativePlatform === "ios" ? "ios" : "android" }),
          });
        } catch {
          registered.current = false;
        }
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const link = (notification.data as { link?: unknown } | undefined)?.link;
        // Solo percorsi interni dell'app.
        if (typeof link === "string" && link.startsWith("/") && !link.startsWith("//")) navigate(link);
      });
      if (nativePlatform === "android") {
        await PushNotifications.createChannel({
          id: "sillabo",
          name: "Sillabo",
          description: "Avvisi dei docenti, correzioni e ripassi",
          importance: 4,
        });
      }
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive === "granted") await PushNotifications.register();
    })();
  }, [isSignedIn]);

  return null;
}
