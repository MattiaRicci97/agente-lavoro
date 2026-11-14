import type { CapacitorConfig } from "@capacitor/cli";

/**
 * L'app per telefono e' il portale stesso, impacchettato: stesse pagine,
 * stesso backend. Il contenuto viene dalla build web (dist) e parla con l'API
 * pubblica indicata da VITE_API_URL al momento della build mobile.
 */
const config: CapacitorConfig = {
  appId: "it.sillabo.app",
  appName: "Sillabo",
  webDir: "dist",
  android: {
    // Niente contenuti http non cifrati dentro l'app.
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
