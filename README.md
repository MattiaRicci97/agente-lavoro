# WorkInProgress HQ

Gestionale editoriale con backend cloud per **WorkInProgress**, il progetto digitale italiano sul mondo del lavoro.

## Architettura

- **Backend**: Supabase (progetto `workinprogress-hq`, regione `eu-central-1`)
  - Postgres: tabelle `contents`, `ideas`, `agent_runs`, `settings` (RLS attiva, accesso solo via service role)
  - Edge Function `api` (`supabase/functions/api`): CRUD + esecuzione degli agenti AI tramite l'API Anthropic (chiave e modello salvati in `settings`); autenticazione con password (`x-app-key`)
  - Edge Function `app` (`supabase/functions/app`): serve l'HTML dell'interfaccia salvato in `settings.app_html` (nota: il dominio functions di Supabase forza `text/plain` + CSP sandbox sulle risposte HTML, quindi l'interfaccia si usa dal file locale o da hosting esterno)
- **Frontend**: `app/WorkInProgressHQ.html` — single file, nessuna build. Login con password, dashboard giornaliera, pipeline kanban, calendario a 8 settimane, Team AI (8 ruoli redazionali che chiamano davvero il modello), banca idee, impostazioni (chiave API, modello).
- `index.html` — la prima versione standalone (dati in localStorage, senza backend), conservata come riferimento.

## Team AI

Otto ruoli con prompt dedicati definiti in `supabase/functions/api/index.ts`: Caporedattore, Sceneggiatore, SEO & Titolista, Data Analyst WorkStat, Social Media Manager, Newsletter Editor, Art Director, Fact-checker Normativo. Ogni esecuzione viene salvata in `agent_runs` e resta consultabile nella scheda del contenuto. Modello predefinito: `claude-opus-4-8` (configurabile: Sonnet 5, Haiku 4.5).

## Uso

1. Apri `app/WorkInProgressHQ.html` in un browser e inserisci la password di redazione.
2. In Impostazioni incolla la chiave API Anthropic (console.anthropic.com): da quel momento il Team AI è operativo, con costi a consumo sul tuo account.
