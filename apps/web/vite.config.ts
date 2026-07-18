import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT ?? 5173);
const apiUrl = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Le variabili VITE_* vengono lette dal file .env nella radice del repo,
  // condiviso con l'API.
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: true,
    proxy: {
      "/api": {
        target: apiUrl,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: true,
  },
});
