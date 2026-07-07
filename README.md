# WorkInProgress HQ

Gestionale editoriale per **WorkInProgress**, il progetto digitale italiano sul mondo del lavoro.

È una web app in un singolo file (`index.html`), senza server né dipendenze: basta aprirla in un browser. I dati vivono nel `localStorage` del browser, con export/import JSON per il backup.

## Cosa fa

- **Oggi** — la dashboard giornaliera: cosa esce oggi secondo la cadenza editoriale (lun short teaser, mer short + LinkedIn, ven video lungo, dom newsletter), contenuti in ritardo o a rischio, prossimi 7 giorni, cattura rapida delle idee.
- **Pipeline** — kanban del flusso di lavoro: Idea → Fonti → Scaletta → Script → Produzione → Pubblicato → Riciclo, con checklist a 8 passi per ogni contenuto.
- **Calendario** — le prossime 8 settimane con gli slot della cadenza settimanale, precaricato col piano editoriale di luglio 2026.
- **Team AI** — otto specialisti virtuali (Caporedattore, Sceneggiatore, SEO & Titolista, Data Analyst WorkStat, Social Media Manager, Newsletter Editor, Art Director, Fact-checker Normativo): per ogni ruolo genera un brief completo — contesto del progetto + istruzioni del ruolo + dettagli del contenuto selezionato — pronto da incollare in una chat con Claude.
- **Idee** — banca idee con rubrica, promuovibili a contenuto in pipeline.
- **Dati** — export/import JSON e ripristino dei dati di esempio.

## Identità

Brand WorkInProgress: sfondo blu scuro, accenti turchese e lime, bussola minimal, testo ad alta leggibilità. Le rubriche (Basi di Lavoro, FAQ Professionali, WorkStat, HR Tech & Cyber, Sociologia & Organizzazione, Talent & Performance, News Flash) e i formati sono quelli definiti nel documento di sintesi del progetto.

## Uso

Apri `index.html` in un browser moderno, oppure servilo staticamente (`python3 -m http.server`). Nessuna build necessaria.
