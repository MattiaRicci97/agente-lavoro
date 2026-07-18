// Build per Vercel: compila il sito (Vite) e impacchetta l'API Express
// in un singolo file che la funzione serverless in api/ può importare.
import { execSync } from "node:child_process";
import { build } from "esbuild";

execSync("pnpm --filter @sillabo/web build", { stdio: "inherit" });

await build({
  entryPoints: ["apps/api/src/vercel.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "api/_server.mjs",
  // pg-native è un binding nativo facoltativo di "pg": non lo usiamo.
  external: ["pg-native"],
  // Le dipendenze CommonJS impacchettate in ESM hanno bisogno di require().
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});

console.log("✓ Bundle API pronto in api/_server.mjs");
