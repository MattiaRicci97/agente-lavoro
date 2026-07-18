import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// Carica il file .env dalla radice del repo (dove l'utente mette le chiavi).
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL deve essere impostata (vedi .env.example nella radice del repo)");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
