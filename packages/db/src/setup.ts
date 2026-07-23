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
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Carica il file .env dalla radice del repo (dove l'utente mette le chiavi).
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

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
  "exam_dates",
  "module_lessons",
  "module_questions",
  "module_lesson_progress",
  "photo_corrections",
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

interface SeedLesson {
  ord: number;
  title: string;
  minutes: number;
  content: string;
  questions: Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>;
}

const FIN_ED_LESSONS: SeedLesson[] = [
  {
    ord: 1,
    title: "Il denaro: a cosa serve davvero",
    minutes: 6,
    content: `Il denaro svolge tre funzioni fondamentali: è un **mezzo di scambio** (ci evita il baratto), un'**unità di conto** (permette di confrontare il valore delle cose) e una **riserva di valore** (possiamo conservarlo per il futuro).

Attenzione però: il denaro conserva il valore solo se i prezzi restano stabili. Quando i prezzi salgono nel tempo si parla di **inflazione**: con gli stessi 100 euro, tra qualche anno, comprerai meno cose di oggi. Per questo "tenere i soldi sotto il materasso" non è mai una strategia neutra: è una perdita silenziosa.

Un esempio concreto: con un'inflazione del 4% annuo, 1.000 euro lasciati fermi per 10 anni avranno un potere d'acquisto di circa 675 euro. Ecco perché capire dove e come tenere i propri risparmi è la prima competenza finanziaria da costruire.

Il primo passo pratico? Distinguere tra **bisogni** (ciò che è necessario) e **desideri** (ciò che è piacevole ma rinviabile). Ogni scelta di spesa è in realtà una scelta tra alternative: gli economisti la chiamano *costo opportunità* — ciò a cui rinunci quando scegli.`,
    questions: [
      {
        question: "Quale di queste NON è una funzione del denaro?",
        options: ["Mezzo di scambio", "Riserva di valore", "Garanzia di guadagno", "Unità di conto"],
        correctIndex: 2,
        explanation: "Il denaro non garantisce alcun guadagno: le sue tre funzioni sono mezzo di scambio, unità di conto e riserva di valore.",
      },
      {
        question: "Con un'inflazione del 4% annuo, cosa succede a 1.000 euro lasciati fermi per anni?",
        options: ["Restano identici in valore", "Perdono potere d'acquisto", "Aumentano di valore", "Vengono tassati automaticamente"],
        correctIndex: 1,
        explanation: "L'inflazione erode il potere d'acquisto: con gli stessi soldi si comprano meno cose.",
      },
      {
        question: "Cos'è il costo opportunità?",
        options: ["Il prezzo di un'occasione speciale", "Ciò a cui rinunci quando fai una scelta", "Il costo di un mutuo", "Una tassa sulle opportunità"],
        correctIndex: 1,
        explanation: "Ogni scelta implica una rinuncia: il valore della migliore alternativa scartata è il costo opportunità.",
      },
    ],
  },
  {
    ord: 2,
    title: "Budget personale: dare un lavoro a ogni euro",
    minutes: 7,
    content: `Un **budget** è semplicemente un piano per i tuoi soldi: quanto entra, quanto esce, e dove va. Senza un piano, i soldi "spariscono"; con un piano, lavorano per i tuoi obiettivi.

Una regola semplice e famosa è la **50/30/20**:
- **50%** per i bisogni (trasporti, cibo, spese necessarie)
- **30%** per i desideri (uscite, abbonamenti, acquisti piacevoli)
- **20%** per risparmio e obiettivi futuri

Non è una legge: è un punto di partenza da adattare. L'importante è la logica: **prima** decidi quanto risparmiare, **poi** spendi il resto — e non il contrario. Gli esperti la chiamano "pagare prima sé stessi".

Strumenti pratici: un quaderno, un foglio di calcolo o un'app. La cosa che conta è tracciare le spese per almeno un mese: quasi tutti scoprono "spese fantasma" (piccoli acquisti ricorrenti che sommati pesano molto — il famoso caffè quotidiano vale oltre 400 euro l'anno).

Obiettivi SMART: un buon obiettivo di risparmio è Specifico, Misurabile, raggiungibile (Achievable), Rilevante e con una scadenza (Time-bound). "Voglio risparmiare" è un desiderio; "metto da parte 30 euro al mese per 10 mesi per le cuffie nuove" è un piano.`,
    questions: [
      {
        question: "Nella regola 50/30/20, a cosa è destinato il 20%?",
        options: ["Ai desideri", "Ai bisogni essenziali", "Al risparmio e agli obiettivi", "Alle tasse"],
        correctIndex: 2,
        explanation: "La regola destina il 50% ai bisogni, il 30% ai desideri e il 20% al risparmio.",
      },
      {
        question: "Cosa significa 'pagare prima sé stessi'?",
        options: ["Comprarsi subito ciò che si desidera", "Mettere da parte il risparmio prima di spendere", "Pagare i propri debiti in ritardo", "Farsi pagare in anticipo"],
        correctIndex: 1,
        explanation: "Significa decidere la quota di risparmio all'inizio del mese, non risparmiare 'quello che avanza'.",
      },
      {
        question: "Quale di questi è un obiettivo SMART?",
        options: ["Voglio essere ricco", "Risparmierò di più", "30 euro al mese per 10 mesi per le cuffie", "Spenderò meno, prima o poi"],
        correctIndex: 2,
        explanation: "È specifico, misurabile, raggiungibile, rilevante e ha una scadenza: tutte le caratteristiche SMART.",
      },
    ],
  },
  {
    ord: 3,
    title: "Banche, conti e pagamenti digitali",
    minutes: 7,
    content: `Il **conto corrente** è la base della vita finanziaria: ci arrivano stipendi e bonifici, ci si appoggiano carte e pagamenti. Ha dei costi (canone, commissioni) che vanno confrontati: per legge ogni banca pubblica l'**ICC** (Indicatore dei Costi Complessivi), che rende i conti confrontabili.

Le carte non sono tutte uguali:
- **Carta di debito** (bancomat): spendi i soldi che hai sul conto, subito.
- **Carta di credito**: spendi soldi della banca, che restituisci a fine mese (o a rate, con interessi — attenzione!).
- **Carta prepagata**: carichi un importo e spendi solo quello. Ottima per iniziare e per gli acquisti online.

I **pagamenti digitali** (contactless, smartphone, app) sono comodi e tracciabili, ma rendono la spesa "invisibile": pagare senza vedere i soldi riduce la percezione di quanto si spende. Il budget serve anche a questo.

Sicurezza, tre regole d'oro: (1) mai comunicare PIN o codici a nessuno — la banca non li chiede MAI per telefono o email; (2) attenzione al **phishing**: messaggi che imitano la banca per rubarti le credenziali; (3) attiva le notifiche per ogni pagamento, così ti accorgi subito di movimenti sospetti.`,
    questions: [
      {
        question: "Qual è la differenza principale tra carta di debito e di credito?",
        options: ["Il colore", "Con il debito spendi i tuoi soldi subito, col credito spendi soldi della banca", "La carta di credito è gratuita", "Nessuna differenza"],
        correctIndex: 1,
        explanation: "La carta di debito preleva subito dal tuo conto; la carta di credito anticipa i soldi della banca, che restituisci dopo.",
      },
      {
        question: "Cos'è il phishing?",
        options: ["Un'app di pagamento", "Un tipo di conto corrente", "Messaggi ingannevoli che imitano banche per rubare credenziali", "Una commissione bancaria"],
        correctIndex: 2,
        explanation: "Il phishing è una truffa digitale: email o SMS che sembrano della banca ma servono a rubare i tuoi codici.",
      },
      {
        question: "La tua 'banca' ti chiama chiedendo il PIN per 'bloccare una frode'. Cosa fai?",
        options: ["Lo comunico subito, è un'emergenza", "Riaggancio: la banca non chiede mai i codici", "Do solo metà del PIN", "Chiedo di richiamare più tardi"],
        correctIndex: 1,
        explanation: "Nessuna banca chiede mai PIN o codici per telefono: è una truffa (vishing). Si riaggancia e si contatta la banca sui canali ufficiali.",
      },
    ],
  },
  {
    ord: 4,
    title: "Risparmio e interesse composto: l'ottava meraviglia",
    minutes: 8,
    content: `L'**interesse composto** è il meccanismo per cui gli interessi generano altri interessi: i tuoi soldi crescono in modo esponenziale, non lineare. Einstein (pare) lo definì "l'ottava meraviglia del mondo".

Esempio: 1.000 euro al 5% annuo diventano 1.050 dopo un anno. Ma il secondo anno il 5% si calcola su 1.050: 1.102,50. Dopo 30 anni? Oltre **4.300 euro**, senza aggiungere nulla. Il tempo è l'ingrediente segreto: chi inizia a 20 anni con poco batte quasi sempre chi inizia a 40 con molto.

La **regola del 72**: per stimare in quanti anni raddoppia un capitale, dividi 72 per il tasso di rendimento. Al 6% annuo: 72 ÷ 6 = 12 anni per raddoppiare.

Attenzione: l'interesse composto lavora anche **contro** di te. I debiti (specie quelli delle carte di credito revolving, con tassi anche del 20%) crescono con la stessa potenza esponenziale. La regola del 72 al contrario: un debito al 18% raddoppia in 4 anni.

Il **fondo di emergenza** è il primo obiettivo di risparmio per tutti: una riserva pari a 3-6 mesi di spese, parcheggiata in strumenti sicuri e subito disponibili. Serve a non indebitarsi quando arriva un imprevisto — e gli imprevisti arrivano sempre.`,
    questions: [
      {
        question: "Cos'è l'interesse composto?",
        options: ["Un interesse pagato in contanti", "Interessi che generano altri interessi nel tempo", "Un interesse fisso mensile", "Una tassa sui risparmi"],
        correctIndex: 1,
        explanation: "Gli interessi maturati si sommano al capitale e generano a loro volta interessi: crescita esponenziale.",
      },
      {
        question: "Secondo la regola del 72, in quanti anni raddoppia un capitale investito al 6% annuo?",
        options: ["6 anni", "72 anni", "12 anni", "24 anni"],
        correctIndex: 2,
        explanation: "72 diviso 6 = 12 anni: è una stima rapida del tempo di raddoppio.",
      },
      {
        question: "A cosa serve il fondo di emergenza?",
        options: ["A investire in borsa", "A coprire imprevisti senza indebitarsi", "A pagare le vacanze", "A comprare azioni in saldo"],
        correctIndex: 1,
        explanation: "È una riserva di 3-6 mesi di spese, liquida e sicura, che protegge dagli imprevisti.",
      },
    ],
  },
  {
    ord: 5,
    title: "Investire: rischio, rendimento e diversificazione",
    minutes: 8,
    content: `Regola numero uno: **rischio e rendimento viaggiano insieme**. Non esistono investimenti con alti guadagni e zero rischio: chi te li promette ti sta truffando (letteralmente: è lo schema delle truffe finanziarie).

I principali strumenti:
- **Obbligazioni**: presti soldi a uno Stato o a un'azienda, che li restituisce con interessi. Rischio in genere più basso, rendimenti più contenuti.
- **Azioni**: compri una piccola quota di un'azienda. Nel breve periodo i prezzi oscillano molto; nel lungo periodo i mercati azionari hanno storicamente reso di più.
- **Fondi ed ETF**: "panieri" che contengono decine o centinaia di titoli. Con un solo acquisto compri un pezzetto di tutto.

La **diversificazione** è l'unico "pasto gratis" della finanza: distribuire i risparmi su tanti strumenti, settori e Paesi riduce il rischio senza sacrificare necessariamente il rendimento. Il proverbio: mai mettere tutte le uova nello stesso paniere.

L'**orizzonte temporale** conta più del tempismo: per obiettivi vicini (1-2 anni) servono strumenti stabili; per obiettivi lontani (10+ anni) si può accettare più oscillazione in cambio di rendimenti attesi maggiori. Provare a "indovinare il momento giusto" per entrare e uscire dal mercato è statisticamente perdente anche per i professionisti.

E le criptovalute? Sono strumenti **estremamente volatili e speculativi**: possono perdere gran parte del valore in poco tempo. Se ne parla molto, ma non sono un investimento adatto a chi inizia — e mai per soldi di cui potresti aver bisogno.`,
    questions: [
      {
        question: "Un'app promette il 30% di guadagno al mese 'senza rischi'. Cos'è?",
        options: ["Un'ottima occasione da cogliere al volo", "Quasi certamente una truffa", "Un normale fondo di investimento", "Un conto deposito"],
        correctIndex: 1,
        explanation: "Alti rendimenti senza rischio non esistono: è il segnale classico di una truffa finanziaria.",
      },
      {
        question: "Cosa significa diversificare?",
        options: ["Comprare solo azioni di aziende famose", "Distribuire i risparmi su tanti strumenti diversi", "Cambiare banca ogni anno", "Investire tutto in criptovalute"],
        correctIndex: 1,
        explanation: "Diversificare = non concentrare tutto su un solo titolo o settore: riduce il rischio complessivo.",
      },
      {
        question: "Qual è la differenza tra azione e obbligazione?",
        options: ["Nessuna, sono sinonimi", "L'azione è una quota di proprietà, l'obbligazione è un prestito", "L'obbligazione rende sempre di più", "L'azione è garantita dallo Stato"],
        correctIndex: 1,
        explanation: "Con l'azione diventi (piccolo) socio; con l'obbligazione sei un creditore che presta denaro.",
      },
    ],
  },
  {
    ord: 6,
    title: "Lavoro, tasse e previdenza: la busta paga spiegata",
    minutes: 8,
    content: `Prima o poi arriverà la prima **busta paga** — ed è meglio saperla leggere. La differenza chiave è tra **lordo** e **netto**: il lordo è quanto costa il tuo lavoro all'azienda in salario; il netto è quanto arriva davvero sul tuo conto, dopo tasse e contributi.

Dove va la differenza?
- **Contributi previdenziali (INPS)**: costruiscono la tua pensione futura. Non sono soldi persi: sono il tuo stipendio di quando avrai 70 anni.
- **IRPEF**: l'imposta sul reddito, che in Italia è **progressiva** — chi guadagna di più paga una percentuale maggiore, per scaglioni.

Le tasse finanziano scuola, sanità, strade, sicurezza: l'articolo 53 della Costituzione stabilisce che "tutti sono tenuti a concorrere alle spese pubbliche in ragione della loro capacità contributiva".

Il lavoro **in nero** (senza contratto) può sembrare conveniente sul momento, ma significa: zero contributi per la pensione, zero tutele in caso di infortunio, zero ferie e malattia pagate, zero anzianità. È un pessimo affare travestito da guadagno facile.

Ultima parola chiave: **previdenza complementare**. La pensione pubblica di chi è giovane oggi sarà probabilmente più leggera di quella dei nonni: iniziare presto ad accantonare anche poco (es. in un fondo pensione) sfrutta l'interesse composto della lezione 4 — il tempo, ancora una volta, è l'alleato più potente.`,
    questions: [
      {
        question: "Qual è la differenza tra stipendio lordo e netto?",
        options: ["Nessuna", "Il netto è il lordo meno tasse e contributi", "Il lordo è quello che arriva sul conto", "Il netto include i contributi"],
        correctIndex: 1,
        explanation: "Dal lordo vengono trattenuti contributi previdenziali e IRPEF: quello che resta è il netto in busta.",
      },
      {
        question: "Cosa significa che l'IRPEF è progressiva?",
        options: ["Aumenta ogni anno", "Chi guadagna di più paga una percentuale maggiore", "Si paga solo in progressione di carriera", "È uguale per tutti"],
        correctIndex: 1,
        explanation: "L'aliquota cresce per scaglioni di reddito: percentuali più alte sui redditi più alti.",
      },
      {
        question: "Perché il lavoro in nero è un cattivo affare per il lavoratore?",
        options: ["Perché si guadagna sempre meno", "Perché niente contributi, tutele, ferie né malattia", "Perché è vietato solo ai giovani", "Non lo è: conviene sempre"],
        correctIndex: 1,
        explanation: "Senza contratto non maturi pensione e perdi ogni tutela: infortuni, malattia, ferie, disoccupazione.",
      },
    ],
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

    // 4. Lezioni del modulo Educazione Finanziaria (idempotente: upsert su module_key+ord)
    for (const lesson of FIN_ED_LESSONS) {
      const { rows } = await client.query(
        `INSERT INTO public.module_lessons (module_key, ord, title, content, minutes)
         VALUES ('ed-finanziaria', $1, $2, $3, $4)
         ON CONFLICT (module_key, ord) DO UPDATE
           SET title = EXCLUDED.title, content = EXCLUDED.content, minutes = EXCLUDED.minutes
         RETURNING id`,
        [lesson.ord, lesson.title, lesson.content, lesson.minutes],
      );
      const lessonId = rows[0].id;
      // Le domande vengono ricreate a ogni seed (nessun dato utente collegato).
      await client.query(`DELETE FROM public.module_questions WHERE lesson_id = $1`, [lessonId]);
      for (const q of lesson.questions) {
        await client.query(
          `INSERT INTO public.module_questions (lesson_id, question, options, correct_index, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [lessonId, q.question, JSON.stringify(q.options), q.correctIndex, q.explanation],
        );
      }
    }
    console.log(`✓ Modulo Ed. Finanziaria: ${FIN_ED_LESSONS.length} lezioni caricate`);

    console.log("\nSetup del database completato.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Setup fallito:", err.message);
  process.exit(1);
});
