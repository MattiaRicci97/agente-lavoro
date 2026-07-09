/**
 * Setup una tantum del database Sillabo (idempotente, si puo' rilanciare).
 *
 * Da eseguire dopo `drizzle-kit push` (o tramite `pnpm db:setup` dalla radice):
 *  1. abilita RLS su tutte le tabelle applicative, cosi' l'API pubblica
 *     PostgREST di Supabase non le espone con la chiave anon
 *     (l'app le raggiunge via connessione Postgres diretta, che non e' soggetta a RLS);
 *  2. crea il bucket privato "materials" su Supabase Storage, con policy che
 *     permettono upload e download ai soli utenti autenticati;
 *  3. carica il catalogo dei moduli della super-app (se non gia' presente).
 */
import pg from "pg";

const { Client } = pg;

const APP_TABLES = [
  "institutions",
  "teachers",
  "classes",
  "students",
  "class_join_requests",
  "material_classes",
  "materials",
  "questions",
  "quiz_attempts",
  "oral_sessions",
  "oral_messages",
  "written_exams",
  "review_items",
  "institution_modules",
  "modules",
];

const MODULE_CATALOG: Array<{
  key: string;
  name: string;
  description: string;
  category: string;
  priceLabel: string;
}> = [
  {
    key: "ed-finanziaria",
    name: "Educazione finanziaria",
    description:
      "Percorsi verticali di educazione finanziaria dentro l'educazione civica, obbligatoria ex Legge 21/2024. Contenuti, esercitazioni e verifiche pronte all'uso.",
    category: "Obblighi normativi",
    priceLabel: "€1.500–3.000/istituto/anno",
  },
  {
    key: "orientamento-pcto",
    name: "Orientamento & PCTO",
    description:
      "Moduli di orientamento in uscita e gestione dei percorsi PCTO, con attivita' guidate e tracciamento delle competenze.",
    category: "Obblighi normativi",
    priceLabel: "€1.500–3.000/istituto/anno",
  },
  {
    key: "inclusione-bes-dsa",
    name: "Inclusione BES-DSA",
    description:
      "Strumenti compensativi AI-nativi: semplificazione automatica dei materiali, mappe testuali e percorsi differenziati per studenti con BES e DSA.",
    category: "Inclusione",
    priceLabel: "€1.500–3.000/istituto/anno",
  },
  {
    key: "competenze-trasversali",
    name: "Competenze trasversali",
    description:
      "Percorsi su metodo di studio, produttivita', comunicazione e soft skill: il tempo liberato dallo studio ottimizzato diventa competenze nuove.",
    category: "Crescita",
    priceLabel: "€1.500–3.000/istituto/anno",
  },
  {
    key: "prep-maturita",
    name: "Preparazione maturità/esami",
    description:
      "Simulazioni complete delle prove d'esame di Stato, piani di ripasso intensivi e interrogazioni simulate sul programma del quinto anno.",
    category: "Esami",
    priceLabel: "€1.500–3.000/istituto/anno",
  },
  {
    key: "italiano-l2",
    name: "Italiano L2",
    description:
      "Percorsi di italiano come seconda lingua per studenti con background migratorio, calibrati sul lessico disciplinare delle materie scolastiche.",
    category: "Inclusione",
    priceLabel: "€1.500–3.000/istituto/anno",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL deve essere impostata (vedi .env.example nella radice del repo)");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // 1. RLS di protezione sulle tabelle applicative
    for (const table of APP_TABLES) {
      await client.query(`ALTER TABLE IF EXISTS public."${table}" ENABLE ROW LEVEL SECURITY`);
    }
    console.log(`✓ RLS abilitata su ${APP_TABLES.length} tabelle`);

    // 2. Bucket Supabase Storage (solo se lo schema storage esiste, cioe' su Supabase)
    const { rows: storageSchema } = await client.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage'`,
    );
    if (storageSchema.length > 0) {
      await client.query(
        `INSERT INTO storage.buckets (id, name, public)
         VALUES ('materials', 'materials', false)
         ON CONFLICT (id) DO NOTHING`,
      );
      await client.query(`DROP POLICY IF EXISTS "sillabo authenticated upload" ON storage.objects`);
      await client.query(
        `CREATE POLICY "sillabo authenticated upload" ON storage.objects
         FOR INSERT TO authenticated WITH CHECK (bucket_id = 'materials')`,
      );
      await client.query(`DROP POLICY IF EXISTS "sillabo authenticated read" ON storage.objects`);
      await client.query(
        `CREATE POLICY "sillabo authenticated read" ON storage.objects
         FOR SELECT TO authenticated USING (bucket_id = 'materials')`,
      );
      console.log(`✓ Bucket "materials" e policy storage configurati`);
    } else {
      console.log("• Schema storage assente (database locale?): bucket saltato");
    }

    // 3. Catalogo moduli
    for (const m of MODULE_CATALOG) {
      await client.query(
        `INSERT INTO public.modules (key, name, description, category, price_label)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               category = EXCLUDED.category,
               price_label = EXCLUDED.price_label`,
        [m.key, m.name, m.description, m.category, m.priceLabel],
      );
    }
    console.log(`✓ Catalogo moduli: ${MODULE_CATALOG.length} moduli caricati`);

    console.log("\nSetup del database completato.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Setup fallito:", err.message);
  process.exit(1);
});
