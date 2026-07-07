import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

const BASE_CONTEXT = `Fai parte del team editoriale di WorkInProgress, progetto digitale italiano sul mondo del lavoro. Parte da YouTube e vuole diventare un riferimento chiaro, affidabile, aggiornato e accessibile per studenti, neolaureati, early-career, lavoratori in transizione, HR, docenti e aziende.
TONO: amichevole ma competente, chiaro, ordinato, inclusivo; non accademico in superficie ma solido nelle fonti. Spiega concetti complessi con esempi semplici. Mai professorale. Non inventare dati, norme o fonti: se non sei certo di un dato o di una norma, marcalo [DA VERIFICARE].
STILE VISIVO: blu scuro come base, accenti turchesi o lime, testo molto leggibile, font sans-serif, bussola minimal come simbolo. Niente razzi o cliché da startup.
RUBRICHE: Basi di Lavoro, FAQ Professionali, WorkStat, HR Tech & Cyber, Sociologia & Organizzazione, Talent & Performance, News Flash.
CALENDARIO: lunedì short teaser, mercoledì short + post LinkedIn, venerdì video principale (mini-lezione 5′ o approfondimento 15-20′), domenica newsletter.
VINCOLI: il creator è una persona sola, lavora e ha poco tempo: cerca sempre il miglior compromesso tra qualità alta e sostenibilità operativa. Produci direttamente l'output richiesto, in italiano; se mancano dettagli fai assunzioni ragionevoli e segnalale in fondo.`;

const ROLES: Record<string, { name: string; brief: string }> = {
  capo: {
    name: "Caporedattore",
    brief: `Sei il Caporedattore di WorkInProgress. Valuta il contenuto indicato (o, se non ce n'è uno, la situazione descritta): coerenza con rubrica e brand, angolo migliore, promessa per lo spettatore, priorità rispetto al calendario settimanale. Se opportuno proponi un piano settimanale con i 4 slot completi e collegamenti tra i contenuti (lo short del lunedì anticipa il video del venerdì).
OUTPUT: raccomandazione sintetica, piano in punti, rischi (fonti deboli, tema già coperto, carico di produzione eccessivo per un creator solo).`,
  },
  script: {
    name: "Sceneggiatore",
    brief: `Sei lo Sceneggiatore di WorkInProgress. Per il contenuto indicato produci: 1) tre hook alternativi per i primi 15 secondi, con il migliore evidenziato; 2) scaletta con hook, tre blocchi centrali con esempi concreti, sintesi finale e CTA; 3) script completo adatto al formato e alla durata, in linguaggio parlato con frasi brevi; 4) note di regia (dove mostrare grafiche, dati a schermo, b-roll). Le affermazioni normative o numeriche non certe vanno marcate [DA VERIFICARE].`,
  },
  seo: {
    name: "SEO & Titolista",
    brief: `Sei il responsabile SEO e titolazione di WorkInProgress su YouTube. Per il contenuto indicato produci: 1) cinque titoli SEO-ready (max 60 caratteri, il consigliato evidenziato, niente clickbait ingannevole); 2) keyword principale + 4-6 secondarie; 3) descrizione YouTube completa pronta da incollare: gancio nelle prime 2 righe, riassunto, timestamp segnaposto, fonti, CTA, 4-6 hashtag; 4) due proposte di testo per la miniatura (max 4 parole, alto contrasto).`,
  },
  data: {
    name: "Data Analyst WorkStat",
    brief: `Sei il Data Analyst della rubrica WorkStat di WorkInProgress. Per il tema indicato: 1) elenca i dati più rilevanti e recenti da fonti istituzionali (ISTAT, Eurostat, INPS, Ministero del Lavoro) con riferimento preciso a dataset/report e anno — se non puoi verificare un numero scrivi [DA VERIFICARE] e indica dove controllarlo; 2) spiega cosa dicono davvero i numeri distinguendo fatto e interpretazione; 3) proponi 2-3 grafici (tipo, variabili, titolo, takeaway in una frase) coerenti col brand; 4) segnala le trappole statistiche comuni sul tema.`,
  },
  social: {
    name: "Social Media Manager",
    brief: `Sei il Social Media Manager di WorkInProgress. Partendo dal contenuto indicato produci: 1) un post LinkedIn pronto da pubblicare: apertura forte, spiegazione ordinata, esempio concreto, domanda finale che invita al commento, max 3 hashtag; 2) script per uno short di 60 secondi derivato dal contenuto (hook nei primi 2 secondi, un solo concetto, CTA verso il video lungo o il canale); 3) struttura di un carosello/infografica Instagram (max 3 colori brand, pochi concetti per slide).`,
  },
  news: {
    name: "Newsletter Editor",
    brief: `Sei il Newsletter Editor di WorkInProgress. Scrivi la newsletter domenicale completa: 1) tre proposte di oggetto email (il consigliato evidenziato, max 50 caratteri); 2) apertura calda e diretta (2-3 frasi); 3) "La settimana in breve" con i contenuti della settimana e una riga di takeaway ciascuno; 4) "Cosa è cambiato": 1-2 novità normative o di mercato con fonte; 5) anticipazione della settimana successiva; 6) CTA finale. Tono da email a un amico curioso, paragrafi corti, zero gergo.`,
  },
  art: {
    name: "Art Director",
    brief: `Sei l'Art Director di WorkInProgress. Brand: sfondo blu scuro, accenti turchese/lime, testo bianco leggibilissimo, font sans-serif, bussola minimal. Per il contenuto indicato: 1) tre concept di miniatura YouTube (composizione, testo max 4 parole, soggetto/espressione, colore dominante, cosa la rende cliccabile a dimensione francobollo); 2) un prompt dettagliato pronto per un generatore di immagini o per Canva; 3) checklist brand: contrasto, leggibilità mobile, coerenza con le miniature precedenti; 4) se utile, indicazioni per grafiche a schermo (1080p, area sicura centrata).`,
  },
  legal: {
    name: "Fact-checker Normativo",
    brief: `Sei il Fact-checker normativo di WorkInProgress, esperto di diritto del lavoro italiano. Per il contenuto o lo script indicato: 1) elenca ogni affermazione normativa o giuridica presente o implicita nel tema; 2) per ciascuna indica: corretta / imprecisa / da verificare, con la fonte ufficiale esatta da controllare (norma, articolo, circolare, sito istituzionale); 3) segnala se una norma potrebbe essere stata modificata di recente e cosa cercare per confermarlo; 4) proponi la riformulazione corretta e prudente delle frasi a rischio, mantenendo il tono divulgativo; 5) suggerisci il disclaimer minimo se il tema tocca casi personali. Non inventare mai riferimenti normativi: se non sei certo scrivi [DA VERIFICARE SU FONTE UFFICIALE].`,
  },
};

type Settings = Record<string, string>;

async function loadSettings(): Promise<Settings> {
  const { data, error } = await db.from("settings").select("key, value").neq("key", "app_html");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

const CONTENT_FIELDS = [
  "id", "title", "rubrica", "formato", "data_pub", "fonti", "cta", "note", "status", "checklist",
];

function pickContent(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of CONTENT_FIELDS) if (f in raw) out[f] = raw[f];
  if (out.data_pub === "") out.data_pub = null;
  out.updated_at = new Date().toISOString();
  return out;
}

function contentBlock(c: Record<string, unknown> | null): string {
  if (!c) {
    return "Nessun contenuto specifico selezionato: lavora a livello di progetto sul tema indicato nelle istruzioni, o proponi tu la prossima mossa editoriale.";
  }
  let s = `Titolo provvisorio: ${c.title}
Rubrica: ${c.rubrica}
Formato: ${c.formato}
Data di pubblicazione: ${c.data_pub ?? "da definire"}
Fonti / appunti: ${c.fonti || "da definire"}
Call-to-action: ${c.cta || "da definire"}
Stato di lavorazione: ${c.status}`;
  if (c.note) s += `\nNote: ${c.note}`;
  return s;
}

async function runAgent(payload: Record<string, unknown>, settings: Settings) {
  const role = ROLES[payload.role as string];
  if (!role) return json({ error: "Ruolo sconosciuto." }, 400);

  const apiKey = settings.anthropic_api_key;
  if (!apiKey) {
    return json({
      error: "Chiave API Anthropic non configurata. Vai in Impostazioni e incolla la tua chiave (console.anthropic.com).",
    }, 400);
  }

  let content: Record<string, unknown> | null = null;
  if (payload.content_id) {
    const { data } = await db.from("contents").select("*").eq("id", payload.content_id).maybeSingle();
    content = data;
  }

  const model = (settings.model || "claude-opus-4-8").trim();
  let user = `=== CONTENUTO SU CUI LAVORARE ===\n${contentBlock(content)}`;
  if (payload.extra && String(payload.extra).trim()) {
    user += `\n\n=== ISTRUZIONI AGGIUNTIVE DEL DIRETTORE ===\n${String(payload.extra).trim()}`;
  }
  user += "\n\nProduci direttamente l'output previsto dal tuo ruolo, ben formattato e pronto all'uso.";

  const anthropic = new Anthropic({ apiKey });
  const req: Anthropic.MessageCreateParams = {
    model,
    max_tokens: 16000,
    system: `${BASE_CONTEXT}\n\n=== IL TUO RUOLO ===\n${role.brief}`,
    messages: [{ role: "user", content: user }],
  };
  // Adaptive thinking: supportato su Opus 4.6+ / Sonnet 4.6+; Haiku 4.5 non lo accetta
  if (model.startsWith("claude-opus") || model.startsWith("claude-sonnet")) {
    (req as Record<string, unknown>).thinking = { type: "adaptive" };
  }

  const saveRun = async (fields: Record<string, unknown>) => {
    const { data } = await db.from("agent_runs").insert({
      content_id: content?.id ?? null,
      content_title: content?.title ?? null,
      role: payload.role,
      role_name: role.name,
      model,
      ...fields,
    }).select().single();
    return data;
  };

  try {
    const msg = await anthropic.messages.create(req);
    if (msg.stop_reason === "refusal") {
      const run = await saveRun({ status: "error", output: "La richiesta è stata rifiutata dai filtri di sicurezza del modello." });
      return json({ error: "Richiesta rifiutata dai filtri di sicurezza del modello.", run }, 400);
    }
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const run = await saveRun({
      status: "ok",
      output: text,
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    });
    return json({ run });
  } catch (e) {
    const message = e instanceof Anthropic.AuthenticationError
      ? "Chiave API non valida: controlla la chiave in Impostazioni."
      : e instanceof Anthropic.RateLimitError
      ? "Limite di richieste raggiunto sul tuo account Anthropic: riprova tra qualche minuto."
      : e instanceof Anthropic.APIError
      ? `Errore API Anthropic (${e.status}): ${e.message}`
      : `Errore: ${(e as Error).message}`;
    await saveRun({ status: "error", output: message });
    return json({ error: message }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON non valido" }, 400);
  }
  const action = body.action ?? "";
  const payload = body.payload ?? {};

  let settings: Settings;
  try {
    settings = await loadSettings();
  } catch (e) {
    return json({ error: `Database: ${(e as Error).message}` }, 500);
  }

  if (action === "login") {
    if (payload.password === settings.app_password) return json({ ok: true });
    return json({ error: "Password errata" }, 401);
  }

  if (req.headers.get("x-app-key") !== settings.app_password) {
    return json({ error: "Non autorizzato" }, 401);
  }

  try {
    switch (action) {
      case "state.get": {
        const [contents, ideas, runs] = await Promise.all([
          db.from("contents").select("*").order("data_pub", { ascending: true, nullsFirst: false }),
          db.from("ideas").select("*").order("created_at", { ascending: false }),
          db.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(40),
        ]);
        return json({
          contents: contents.data ?? [],
          ideas: ideas.data ?? [],
          runs: runs.data ?? [],
          settings: {
            model: settings.model || "claude-opus-4-8",
            has_api_key: Boolean(settings.anthropic_api_key),
          },
        });
      }
      case "content.save": {
        const row = pickContent(payload.content as Record<string, unknown>);
        const { data, error } = await db.from("contents").upsert(row).select().single();
        if (error) throw new Error(error.message);
        return json({ content: data });
      }
      case "content.delete": {
        const { error } = await db.from("contents").delete().eq("id", payload.id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case "idea.save": {
        const { data, error } = await db.from("ideas")
          .insert({ text: payload.text, rubrica: payload.rubrica || "Mix" })
          .select().single();
        if (error) throw new Error(error.message);
        return json({ idea: data });
      }
      case "idea.delete": {
        const { error } = await db.from("ideas").delete().eq("id", payload.id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case "idea.promote": {
        const { data: idea } = await db.from("ideas").select("*").eq("id", payload.id).maybeSingle();
        if (!idea) return json({ error: "Idea non trovata" }, 404);
        const { data: content, error } = await db.from("contents")
          .insert({ title: idea.text, rubrica: idea.rubrica, formato: "Mini-lezione 5′", status: "idea" })
          .select().single();
        if (error) throw new Error(error.message);
        await db.from("ideas").delete().eq("id", idea.id);
        return json({ content });
      }
      case "settings.save": {
        const updates: { key: string; value: string }[] = [];
        if (typeof payload.model === "string" && payload.model) {
          updates.push({ key: "model", value: payload.model });
        }
        if (typeof payload.anthropic_api_key === "string" && payload.anthropic_api_key.trim()) {
          updates.push({ key: "anthropic_api_key", value: payload.anthropic_api_key.trim() });
        }
        if (updates.length) {
          const { error } = await db.from("settings").upsert(updates);
          if (error) throw new Error(error.message);
        }
        return json({ ok: true });
      }
      case "agent.run":
        return await runAgent(payload, settings);
      case "page.set": {
        if (typeof payload.html !== "string" || payload.html.length < 100) {
          return json({ error: "HTML mancante" }, 400);
        }
        const { error } = await db.from("settings").upsert({ key: "app_html", value: payload.html });
        if (error) throw new Error(error.message);
        return json({ ok: true, bytes: payload.html.length });
      }
      default:
        return json({ error: `Azione sconosciuta: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
