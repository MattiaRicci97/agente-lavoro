import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Carica il file .env dalla radice del repo (condiviso tra api e web),
// poi un eventuale .env locale dell'app che può sovrascrivere i valori.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });
config({ path: path.resolve(here, "../.env"), override: true });
