import { defineConfig } from "vitest/config";

/**
 * Due famiglie di test:
 *  - test/unit: logica pura, nessuna rete e nessun database;
 *  - test/integration: API vera contro un Postgres locale su cui sono stati
 *    eseguiti `drizzle-kit push` e `setup.ts`. Si attivano solo se e' impostata
 *    TEST_DATABASE_URL (altrimenti vengono saltati, non falliti).
 *
 *    Esempio:
 *      TEST_DATABASE_URL=postgresql://pguser@127.0.0.1:5434/sillabo_test pnpm test
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      LOG_LEVEL: "silent",
    },
  },
});
