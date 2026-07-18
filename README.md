# Sillabo — il sistema operativo della didattica

La suite di collaborazione AI-nativa per scuole e università. Il docente carica il proprio
materiale; Sillabo lo trasforma in percorsi attivi (domande a richiamo attivo, simulazioni di
interrogazioni orali e verifiche scritte, piani di ripasso a ripetizione spaziata) e restituisce
al docente analytics reali sull'apprendimento.

Questa è l'applicazione completa, indipendente da Replit: gira sul tuo computer (o su un tuo
server) ed è collegata al **tuo** progetto Supabase (`sillabo`, hosting UE — Francoforte) per
database, autenticazione e archiviazione file. L'AI usa l'API Anthropic con la **tua** chiave.

## Struttura del progetto

```
apps/
  web/        Frontend React (Vite + Tailwind + shadcn/ui) — area Cattedra e area Studio
  api/        API Express — auth, classi, materiali, quiz, interrogazioni, analytics
packages/
  db/         Schema del database (Drizzle ORM) + script di setup
  api-zod/    Schemi di validazione condivisi (Zod)
  api-client-react/  Client API tipizzato per il frontend (TanStack Query)
```

## Primo avvio (una tantum, ~10 minuti)

Prerequisiti: [Node.js 20+](https://nodejs.org) e [pnpm](https://pnpm.io) (`npm install -g pnpm`).

**1. Clona il repo e installa le dipendenze**

```bash
git clone https://github.com/MattiaRicci97/agente-lavoro.git sillabo
cd sillabo
pnpm install
```

**2. Configura le chiavi**

```bash
cp .env.example .env
```

Apri `.env` e completa i tre valori seguendo i commenti nel file:

| Variabile | Dove trovarla |
|---|---|
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | [Dashboard Supabase → Settings → API Keys](https://supabase.com/dashboard/project/fxtpzstsoqygmxehzfxf/settings/api-keys) |
| `DATABASE_URL` | Dashboard Supabase → pulsante **Connect** → scheda *Session pooler* (sostituisci `[YOUR-PASSWORD]`; se non la ricordi: Settings → Database → *Reset database password*) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys (serve una carta; le prove costano centesimi) |

**3. Prepara il database** (crea tabelle, bucket file, catalogo moduli — si può rilanciare senza rischi)

```bash
pnpm db:setup
```

**4. (Consigliato) Disattiva la conferma email per le prove**

Di default Supabase chiede di confermare l'email a ogni nuova registrazione. Per provare l'app
senza attese: [Dashboard → Authentication → Sign In / Providers → Email](https://supabase.com/dashboard/project/fxtpzstsoqygmxehzfxf/auth/providers)
→ disattiva **Confirm email**. (Riattivala prima di far entrare utenti veri.)

## Avvio quotidiano

```bash
pnpm dev
```

- App: **http://localhost:5173**
- API: http://localhost:3001 (il frontend la raggiunge automaticamente via proxy)

Per provare il flusso completo: registrati come **docente** (crea istituto e classe, carica un
materiale), poi in una finestra in incognito registrati come **studente** con un'altra email e
inserisci il codice classe. Il docente approva la richiesta da "Richieste" e lo studente può
iniziare a esercitarsi.

## Comandi utili

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | Avvia frontend + API insieme |
| `pnpm build` | Build di produzione |
| `pnpm typecheck` | Controllo TypeScript su tutto il monorepo |
| `pnpm db:setup` | Applica schema, bucket, policy e catalogo moduli al database |
| `pnpm db:push` | Applica solo le modifiche allo schema (dopo aver cambiato `packages/db/src/schema`) |

## Architettura e scelte tecniche

- **Autenticazione: Supabase Auth** (email + password). Il frontend ottiene un token JWT che il
  client API allega a ogni chiamata; il server lo verifica presso Supabase. Il ruolo
  (docente/studente) è salvato nei metadati dell'utente.
- **Database: Supabase Postgres** via Drizzle ORM (connessione diretta, pooler in regione UE).
  Le tabelle hanno RLS attiva senza policy: sono raggiungibili solo dall'API dell'app, mai
  dall'API pubblica di Supabase.
- **File: Supabase Storage** (bucket privato `materials`). Upload diretto dal browser con URL
  firmati; solo utenti autenticati possono caricare e leggere.
- **AI: API Anthropic** (modello `claude-sonnet-4-6`, configurabile con `ANTHROPIC_MODEL`).
  Genera domande a richiamo attivo, corregge risposte aperte e verifiche scritte, conduce
  l'interrogazione orale simulata, classifica i materiali sul programma ministeriale
  (Curriculum Graph) e semplifica i contenuti per studenti BES/DSA.
- **Privacy by design**: dati e file su hosting UE (Francoforte), nessun servizio USA oltre
  all'inference AI, chiavi sotto il tuo controllo.

## Pubblicare online (quando vorrai)

Il repo è pronto per il deploy senza modifiche al codice:

1. **API** (`apps/api`): su [Render](https://render.com) o [Railway](https://railway.app) —
   comando di avvio `pnpm --filter @sillabo/api run start`, più le variabili d'ambiente del
   file `.env` (senza le `VITE_*`).
2. **Frontend** (`apps/web`): su [Vercel](https://vercel.com) o Netlify — build
   `pnpm --filter @sillabo/web run build`, output `apps/web/dist`, variabili `VITE_SUPABASE_URL`
   e `VITE_SUPABASE_ANON_KEY`. Imposta anche `VITE_API_URL` con l'indirizzo dell'API pubblicata
   (e nel codice viene usato da `setBaseUrl`) oppure servi frontend e API sullo stesso dominio.

In alternativa, un'unica macchina (VPS) può servire entrambi: `pnpm build`, poi l'API con
`pnpm --filter @sillabo/api run start` e i file statici di `apps/web/dist` con un web server
(nginx/Caddy) che inoltra `/api` all'API.

## Roadmap (dal business plan)

Il core attuale copre la fetta verticale dell'MVP: materiali → percorso attivo → analytics.
I prossimi passi naturali: interrogazione orale **a voce** (STT/TTS), piani di ripasso agganciati
al calendario verifiche, dashboard di istituto, moduli attivabili (educazione finanziaria,
orientamento/PCTO, BES-DSA…), integrazioni registro elettronico e LTI per l'università.
