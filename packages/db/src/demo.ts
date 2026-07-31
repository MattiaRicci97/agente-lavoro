/**
 * Classe dimostrativa di Sillabo.
 *
 * Le funzioni piu' convincenti — registro, andamento, scrutinio, coda delle
 * validazioni — mostrano il loro valore solo se dietro c'e' una storia: decine
 * di valutazioni firmate, di materie diverse, distribuite su mesi. A mano
 * servirebbero ore di clic, e comunque tutte le date sarebbero di oggi.
 *
 * Questo script crea un istituto demo completo e realistico, separato dai dati
 * veri, e lo assegna al docente indicato per email cosi' che lo veda entrando
 * col proprio account.
 *
 *   pnpm demo:seed  tua@email.it     crea l'istituto dimostrativo
 *   pnpm demo:clean                  lo rimuove per intero
 *
 * I dati sono deterministici: rilanciando lo script si ottiene la stessa
 * classe, con gli stessi voti. Nessun dato reale viene toccato.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { Client } = pg;

const ISTITUTO = "Istituto Demo Sillabo";
const CLASSE = "4C";
const JOIN_CODE = "DEMO4C";

/** Generatore deterministico: la classe demo e' sempre la stessa. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const NOMI = [
  "Alessandro Bianchi", "Beatrice Colombo", "Cristian Ferrari", "Diletta Ricci",
  "Edoardo Marino", "Federica Greco", "Gabriele Bruno", "Giorgia Gallo",
  "Iacopo Conti", "Ludovica De Luca", "Manuel Mancini", "Martina Costa",
  "Nicolo Giordano", "Sara Rizzo", "Pietro Lombardi", "Rebecca Moretti",
  "Samuele Barbieri", "Sofia Fontana", "Tommaso Caruso", "Viola Santoro",
  "Andrea Rinaldi", "Chiara Villa",
];

/** Chi ha una certificazione: la scheda lo segnala al consiglio. */
const BES_DSA = new Set(["Diletta Ricci", "Manuel Mancini", "Tommaso Caruso"]);

const MATERIE = [
  {
    subject: "Italiano",
    docente: null as string | null, // il docente reale che lancia lo script
    materiale: {
      title: "Giacomo Leopardi: il pessimismo storico",
      content:
        "Giacomo Leopardi (1798-1837) attraversa tre fasi di pensiero. Nella prima, il pessimismo storico, " +
        "la natura e' vista come madre benevola e la ragione come causa dell'infelicita' moderna: gli antichi, " +
        "piu' vicini alla natura e capaci di illusioni, erano piu' felici. Nella seconda fase, il pessimismo " +
        "cosmico, la natura diventa matrigna indifferente e l'infelicita' e' condizione universale di tutti gli " +
        "esseri viventi. Nella terza, il messaggio della Ginestra, Leopardi indica nella solidarieta' fra gli " +
        "uomini contro la natura ostile l'unica risposta possibile. I Canti e le Operette morali documentano " +
        "questo percorso.",
      domande: [
        ["Che cosa distingue il pessimismo storico da quello cosmico?", "Nel pessimismo storico la natura e' benevola e l'infelicita' nasce dalla civilta'; in quello cosmico la natura stessa e' indifferente e l'infelicita' e' universale.", "Le fasi del pensiero"],
        ["Perche' secondo Leopardi gli antichi erano piu' felici?", "Perche' erano piu' vicini alla natura e capaci di illusioni, non ancora corrosi dalla ragione.", "Le fasi del pensiero"],
        ["Qual e' il messaggio della Ginestra?", "La solidarieta' fra gli uomini come unica risposta all'indifferenza della natura.", "La Ginestra"],
        ["Che ruolo ha la ragione nel pensiero leopardiano?", "E' la facolta' che smaschera le illusioni e per questo rende l'uomo moderno infelice.", "Ragione e illusioni"],
        ["Quali opere documentano il percorso di Leopardi?", "I Canti e le Operette morali.", "Le opere"],
      ],
    },
  },
  {
    subject: "Matematica",
    docente: "Elena Bruni",
    materiale: {
      title: "Le derivate: significato e regole di calcolo",
      content:
        "La derivata di una funzione in un punto misura la rapidita' con cui la funzione varia in quel punto, " +
        "e coincide geometricamente con il coefficiente angolare della retta tangente al grafico. Si definisce " +
        "come limite del rapporto incrementale. Le regole fondamentali di calcolo sono: la derivata di una " +
        "costante e' zero; la derivata di x elevato a n e' n per x elevato a n-1; la derivata di una somma e' " +
        "la somma delle derivate; per il prodotto e il quoziente valgono regole specifiche. La derivata prima " +
        "permette di studiare crescenza e decrescenza, la derivata seconda la concavita'.",
      domande: [
        ["Che cosa misura la derivata di una funzione in un punto?", "La rapidita' di variazione della funzione, cioe' il coefficiente angolare della retta tangente.", "Significato"],
        ["Come si definisce formalmente la derivata?", "Come limite del rapporto incrementale al tendere a zero dell'incremento.", "Definizione"],
        ["Quanto vale la derivata di una costante?", "Zero.", "Regole di calcolo"],
        ["Qual e' la derivata di x elevato a n?", "n per x elevato a n-1.", "Regole di calcolo"],
        ["A cosa serve la derivata seconda?", "A studiare la concavita' della funzione e individuare i punti di flesso.", "Applicazioni"],
      ],
    },
  },
  {
    subject: "Storia",
    docente: "Marco Conti",
    materiale: {
      title: "L'eta' giolittiana",
      content:
        "L'eta' giolittiana (1901-1914) segna il tentativo di modernizzare l'Italia integrando il movimento " +
        "operaio nello Stato liberale. Giovanni Giolitti adotta la neutralita' dello Stato nei conflitti di " +
        "lavoro, favorisce lo sviluppo industriale del triangolo Milano-Torino-Genova e vara il suffragio " +
        "universale maschile nel 1912. Restano irrisolti il divario fra Nord e Sud e il fenomeno " +
        "dell'emigrazione di massa. La guerra di Libia del 1911 e il patto Gentiloni segnano l'esaurimento " +
        "del progetto giolittiano.",
      domande: [
        ["Quale fu la strategia di Giolitti verso il movimento operaio?", "Integrarlo nello Stato liberale mantenendo la neutralita' dello Stato nei conflitti di lavoro.", "La politica giolittiana"],
        ["Che cosa fu il suffragio universale maschile del 1912?", "L'estensione del diritto di voto a tutti i cittadini maschi, che allargo' enormemente la base elettorale.", "Le riforme"],
        ["Quali problemi restarono irrisolti nell'eta' giolittiana?", "Il divario fra Nord e Sud e l'emigrazione di massa.", "I limiti"],
        ["Che cosa fu la guerra di Libia?", "La campagna coloniale del 1911 che segno' una svolta nazionalista e l'inizio della crisi del sistema giolittiano.", "La crisi"],
        ["Che cos'e' il patto Gentiloni?", "L'accordo del 1913 con cui i cattolici appoggiarono i liberali, segno della fine dell'equilibrio giolittiano.", "La crisi"],
      ],
    },
  },
];

const AVVISI = [
  { kind: "avviso", title: "Assemblea di istituto venerdi", body: "Venerdi 14 le lezioni terminano alle 11. L'assemblea si tiene in aula magna.", pinned: true, giorni: 3 },
  { kind: "avviso", title: "Uscita didattica: consegnate le autorizzazioni", body: "Ricordo di consegnare l'autorizzazione firmata entro lunedi. Chi non la consegna non potra' partecipare.", pinned: false, giorni: 8 },
  { kind: "verifica", title: "Verifica di Storia: eta' giolittiana", body: "La verifica si svolgera' come da calendario. Studiare il capitolo 12 per intero.", pinned: false, giorni: 15 },
  { kind: "materiale", title: "Nuovo materiale: Leopardi", body: "Ho caricato il materiale su Leopardi con le domande di ripasso collegate.", pinned: false, giorni: 22 },
];

function giorniFa(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function seed(client: pg.Client, email: string) {
  const { rows: docenti } = await client.query(
    "SELECT id, name FROM teachers WHERE lower(email) = lower($1)",
    [email],
  );
  if (!docenti.length) {
    throw new Error(
      `Nessun docente registrato con l'email ${email}.\n` +
        `Registrati prima su Sillabo con quell'indirizzo, poi rilancia il comando.`,
    );
  }
  const docente = docenti[0];

  const { rows: esistenti } = await client.query("SELECT id FROM institutions WHERE name = $1", [ISTITUTO]);
  if (esistenti.length) {
    throw new Error(
      `"${ISTITUTO}" esiste gia'.\nLancia prima "pnpm demo:clean" se vuoi ricrearlo da zero.`,
    );
  }

  const rnd = makeRandom(20260731);

  // --- Istituto con licenza attiva -----------------------------------------
  const scadenza = new Date();
  scadenza.setFullYear(scadenza.getFullYear() + 1);
  const { rows: [istituto] } = await client.query(
    `INSERT INTO institutions (name, city, plan, seats, license_expires_at, license_notes)
     VALUES ($1, 'Rimini', 'istituto', 25, $2, 'Licenza dimostrativa') RETURNING id`,
    [ISTITUTO, scadenza.toISOString()],
  );

  // --- Docenti: quello reale + due colleghi (che non accedono) -------------
  const teacherIds = new Map<string, number>();
  teacherIds.set(docente.name, docente.id);
  await client.query(
    `INSERT INTO institution_members (institution_id, teacher_id, role) VALUES ($1,$2,'amministratore')
     ON CONFLICT DO NOTHING`,
    [istituto.id, docente.id],
  );

  for (const [nome, materia] of [["Elena Bruni", "Matematica"], ["Marco Conti", "Storia"]]) {
    const { rows: [t] } = await client.query(
      `INSERT INTO teachers (auth_user_id, name, email, title, subjects)
       VALUES ($1, $2, $3, 'Prof.', $4) RETURNING id`,
      [
        `demo-teacher-${nome.toLowerCase().replace(/\W/g, "")}`,
        nome,
        `${nome.toLowerCase().replace(/\W/g, ".")}@demo.sillabo.it`,
        JSON.stringify([materia]),
      ],
    );
    teacherIds.set(nome, t.id);
    await client.query(
      "INSERT INTO institution_members (institution_id, teacher_id, role) VALUES ($1,$2,'docente')",
      [istituto.id, t.id],
    );
  }

  // --- La classe e il suo consiglio ----------------------------------------
  const { rows: [classe] } = await client.query(
    `INSERT INTO classes (institution_id, teacher_id, name, grade_level, teacher_name, join_code)
     VALUES ($1,$2,$3,'4ª superiore',$4,$5) RETURNING id`,
    [istituto.id, docente.id, CLASSE, docente.name, JOIN_CODE],
  );
  await client.query(
    "INSERT INTO class_teachers (class_id, teacher_id, subject, role) VALUES ($1,$2,'Italiano','coordinatore')",
    [classe.id, docente.id],
  );
  for (const [nome, materia] of [["Elena Bruni", "Matematica"], ["Marco Conti", "Storia"]]) {
    await client.query(
      "INSERT INTO class_teachers (class_id, teacher_id, subject, role) VALUES ($1,$2,$3,'docente')",
      [classe.id, teacherIds.get(nome), materia],
    );
  }

  // --- Gli studenti, ciascuno con un livello di partenza -------------------
  const studenti: Array<{ id: number; name: string; authId: string; livello: number; tendenza: number }> = [];
  for (const [i, nome] of NOMI.entries()) {
    const authId = `demo-4c-${String(i + 1).padStart(2, "0")}`;
    const { rows: [s] } = await client.query(
      "INSERT INTO students (auth_user_id, name, class_id, bes_dsa) VALUES ($1,$2,$3,$4) RETURNING id",
      [authId, nome, classe.id, BES_DSA.has(nome)],
    );
    studenti.push({
      id: s.id,
      name: nome,
      authId,
      livello: 4.8 + rnd() * 3.6, // da poco sotto la sufficienza all'eccellenza
      tendenza: rnd() < 0.3 ? (rnd() < 0.5 ? 1.4 : -1.2) : 0, // qualcuno cresce, qualcuno cala
    });
  }

  // --- Materiali, domande e valutazioni firmate ----------------------------
  const materialIds: Record<string, number> = {};
  let votiFirmati = 0;

  for (const m of MATERIE) {
    const nomeDocente = m.docente ?? docente.name;
    const teacherId = teacherIds.get(nomeDocente)!;

    const { rows: [mat] } = await client.query(
      `INSERT INTO materials (teacher_id, title, subject, grade_level, content, curriculum_topic)
       VALUES ($1,$2,$3,'4ª superiore',$4,$5) RETURNING id`,
      [teacherId, m.materiale.title, m.subject, m.materiale.content, m.subject],
    );
    materialIds[m.subject] = mat.id;
    await client.query("INSERT INTO material_classes (material_id, class_id) VALUES ($1,$2)", [mat.id, classe.id]);

    for (const [domanda, risposta, topic] of m.materiale.domande) {
      await client.query(
        `INSERT INTO questions (material_id, question, answer, topic, difficulty, status, author_type)
         VALUES ($1,$2,$3,$4,'medio','approvata','ai')`,
        [mat.id, domanda, risposta, topic],
      );
    }

    // Tre prove per studente, distribuite su circa quattro mesi.
    for (const s of studenti) {
      for (const [k, giorno] of [110, 70, 30].entries()) {
        const progresso = k / 2;
        const voto = Math.max(
          3,
          Math.min(10, Math.round(s.livello + s.tendenza * progresso + (rnd() - 0.5) * 1.6)),
        );
        await client.query(
          `INSERT INTO photo_corrections
             (auth_user_id, student_name, class_id, subject, grade_level, material_id, assignment_prompt,
              image_object_path, transcription, grade, feedback, strengths, improvements,
              validation_status, teacher_grade, teacher_feedback, validated_by_teacher_id, validated_at, created_at)
           VALUES ($1,$2,$3,$4,'4ª superiore',$5,$6,'/objects/demo.jpg','(trascrizione dimostrativa)',
                   $7,'Proposta dell''assistente.','[]','[]','validata',$7,$8,$9,$10,$10)`,
          [
            s.authId, s.name, classe.id, m.subject, mat.id,
            `Esercitazione di ${m.subject}`,
            voto,
            voto >= 6
              ? "Prova nel complesso corretta, esposizione ordinata."
              : "Diversi passaggi da rivedere: riprendere gli esercizi assegnati.",
            teacherId,
            giorniFa(giorno + Math.floor(rnd() * 8)),
          ],
        );
        votiFirmati += 1;
      }
    }
  }

  // --- Interrogazioni firmate su Italiano ----------------------------------
  for (const s of studenti.slice(0, 14)) {
    const voto = Math.max(3, Math.min(10, Math.round(s.livello + (rnd() - 0.5) * 1.8)));
    await client.query(
      `INSERT INTO oral_sessions
         (material_id, auth_user_id, class_id, student_name, status, grade, feedback,
          validation_status, teacher_grade, teacher_feedback, validated_by_teacher_id, validated_at, created_at)
       VALUES ($1,$2,$3,$4,'completata',$5,'Proposta dell''assistente.','validata',$5,$6,$7,$8,$8)`,
      [
        materialIds["Italiano"], s.authId, classe.id, s.name, voto,
        voto >= 6 ? "Esposizione chiara, collegamenti pertinenti." : "Conoscenze frammentarie, riprendere il ripasso.",
        docente.id,
        giorniFa(45 + Math.floor(rnd() * 20)),
      ],
    );
    votiFirmati += 1;
  }

  // --- Esercitazione autonoma (quiz) ---------------------------------------
  for (const s of studenti) {
    const sessioni = 1 + Math.floor(rnd() * 5);
    for (let i = 0; i < sessioni; i++) {
      const totale = 10;
      const giuste = Math.max(2, Math.min(totale, Math.round((s.livello / 10) * totale + (rnd() - 0.5) * 2)));
      await client.query(
        `INSERT INTO quiz_attempts
           (material_id, auth_user_id, class_id, student_name, score, total, graded_answers, duration_seconds, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'[]',$7,$8)`,
        [
          materialIds["Italiano"], s.authId, classe.id, s.name, giuste, totale,
          300 + Math.floor(rnd() * 600), giorniFa(Math.floor(rnd() * 90)),
        ],
      );
    }
  }

  // --- Un compito assegnato, con consegne (alcune ancora da correggere) ----
  const { rows: [compito] } = await client.query(
    `INSERT INTO written_exams (material_id, exam_type, prompt, assigned_by_teacher_id, due_date, instructions, status, created_at)
     VALUES ($1,'tema',$2,$3,$4,'Minimo 30 righe. Citare almeno due testi.','assegnato',$5) RETURNING id`,
    [
      materialIds["Italiano"],
      "Il passaggio dal pessimismo storico al pessimismo cosmico in Leopardi: illustra le due fasi mettendole in " +
        "relazione con i testi letti in classe.",
      docente.id,
      new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
      giorniFa(6),
    ],
  );
  for (const [i, s] of studenti.slice(0, 15).entries()) {
    const voto = Math.max(3, Math.min(10, Math.round(s.livello + (rnd() - 0.5) * 1.5)));
    const daValidare = i >= 12; // le ultime tre restano in attesa del visto
    await client.query(
      `INSERT INTO written_exam_submissions
         (exam_id, auth_user_id, student_name, class_id, answer, ai_grade, ai_feedback,
          validation_status, teacher_grade, teacher_feedback, validated_by_teacher_id, validated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Proposta dell''assistente sull''elaborato.',$7,$8,$9,$10,$11,$12)`,
      [
        compito.id, s.authId, s.name, classe.id,
        `Elaborato dimostrativo di ${s.name} sul pessimismo leopardiano. (testo di esempio)`,
        voto,
        daValidare ? "da_validare" : "validata",
        daValidare ? null : voto,
        daValidare ? null : "Tesi chiara, curare maggiormente le citazioni.",
        daValidare ? null : docente.id,
        daValidare ? null : giorniFa(3),
        giorniFa(5),
      ],
    );
    if (!daValidare) votiFirmati += 1;
  }

  // --- Qualche proposta in attesa, cosi' la coda "Da validare" non e' vuota
  for (const s of studenti.slice(15, 19)) {
    await client.query(
      `INSERT INTO photo_corrections
         (auth_user_id, student_name, class_id, subject, grade_level, material_id, assignment_prompt,
          image_object_path, transcription, grade, feedback, strengths, improvements, created_at)
       VALUES ($1,$2,$3,'Matematica','4ª superiore',$4,'Esercizi sulle derivate',
               '/objects/demo.jpg','(trascrizione dimostrativa)',$5,
               'Procedimento avviato correttamente, alcuni passaggi da chiarire.','[]','[]',$6)`,
      [s.authId, s.name, classe.id, materialIds["Matematica"],
       Math.max(4, Math.min(9, Math.round(s.livello))), giorniFa(1)],
    );
  }

  // --- Bacheca: avvisi, alcuni gia' letti ----------------------------------
  for (const a of AVVISI) {
    const autore = a.kind === "verifica" ? "Marco Conti" : docente.name;
    const { rows: [post] } = await client.query(
      `INSERT INTO class_posts (class_id, teacher_id, author_name, kind, title, body, pinned, material_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        classe.id, teacherIds.get(autore) ?? docente.id, autore, a.kind, a.title, a.body, a.pinned,
        a.kind === "materiale" ? materialIds["Italiano"] : null,
        giorniFa(a.giorni),
      ],
    );
    // Circa due terzi della classe lo ha aperto: il docente vede chi manca.
    for (const s of studenti) {
      if (rnd() < 0.68) {
        await client.query(
          "INSERT INTO class_post_reads (post_id, auth_user_id, student_name, read_at) VALUES ($1,$2,$3,$4)",
          [post.id, s.authId, s.name, giorniFa(a.giorni - 1)],
        );
      }
    }
  }

  // --- Verifica in calendario ----------------------------------------------
  await client.query(
    `INSERT INTO exam_dates (class_id, material_id, title, subject, exam_date)
     VALUES ($1,$2,'Verifica: eta'' giolittiana','Storia',$3)`,
    [classe.id, materialIds["Storia"], new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10)],
  );

  console.log(`\n✓ "${ISTITUTO}" creato e assegnato a ${docente.name}\n`);
  console.log(`  Classe ${CLASSE} · ${NOMI.length} studenti (${BES_DSA.size} con certificazione BES/DSA)`);
  console.log(`  Consiglio di classe: ${docente.name} (coordinatore, Italiano), Elena Bruni (Matematica), Marco Conti (Storia)`);
  console.log(`  ${votiFirmati} valutazioni firmate distribuite sugli ultimi quattro mesi`);
  console.log(`  1 compito assegnato con 15 consegne, 3 ancora da correggere`);
  console.log(`  4 proposte in attesa di visto, ${AVVISI.length} avvisi in bacheca, 1 verifica in calendario`);
  console.log(`\n  Codice per iscriversi alla classe: ${JOIN_CODE}`);
  console.log(`  (per provare il lato studente, iscriviti con un account studente usando questo codice)\n`);
  console.log(`  Per rimuovere tutto: pnpm demo:clean\n`);
}

async function clean(client: pg.Client) {
  const { rows } = await client.query("SELECT id FROM institutions WHERE name = $1", [ISTITUTO]);
  if (!rows.length) {
    console.log(`Nessun "${ISTITUTO}" da rimuovere.`);
    return;
  }
  const istitutoId = rows[0].id;

  // Cancellare l'istituto non basta: valutazioni e materiali sopravvivono,
  // perche' le loro chiavi esterne verso la classe sono "set null" invece che
  // "cascade". Resterebbero centinaia di righe orfane nel database. Vanno
  // quindi rimossi esplicitamente, riconoscendoli dai marcatori del demo.
  const { rows: classi } = await client.query("SELECT id FROM classes WHERE institution_id = $1", [istitutoId]);
  const classIds = classi.map((c) => c.id);

  const { rows: materiali } = classIds.length
    ? await client.query("SELECT DISTINCT material_id FROM material_classes WHERE class_id = ANY($1)", [classIds])
    : { rows: [] as Array<{ material_id: number }> };
  const materialIds = materiali.map((m) => m.material_id);

  let rimosse = 0;
  for (const tabella of ["photo_corrections", "oral_sessions", "quiz_attempts", "written_exam_submissions"]) {
    const { rowCount } = await client.query(
      `DELETE FROM ${tabella} WHERE auth_user_id LIKE 'demo-4c-%'`,
    );
    rimosse += rowCount ?? 0;
  }

  if (classIds.length) {
    await client.query("DELETE FROM exam_dates WHERE class_id = ANY($1)", [classIds]);
  }
  if (materialIds.length) {
    // Cancella a cascata domande, compiti assegnati e consegne collegate.
    await client.query("DELETE FROM materials WHERE id = ANY($1)", [materialIds]);
  }

  await client.query("DELETE FROM institutions WHERE id = $1", [istitutoId]);
  const { rowCount: docentiRimossi } = await client.query(
    "DELETE FROM teachers WHERE auth_user_id LIKE 'demo-teacher-%'",
  );

  console.log(
    `✓ "${ISTITUTO}" rimosso: ${rimosse} valutazioni ed esercitazioni, ` +
      `${materialIds.length} materiali, ${docentiRimossi ?? 0} docenti dimostrativi.`,
  );
  console.log("  I dati reali non sono stati toccati.");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL deve essere impostata (vedi .env nella radice del repo)");
  }

  const azione = process.argv[2];
  const email = process.argv[3];
  if (azione !== "seed" && azione !== "clean") {
    throw new Error('Uso: tsx src/demo.ts seed <email-docente> | tsx src/demo.ts clean');
  }
  if (azione === "seed" && !email) {
    throw new Error(
      "Serve l'email del docente a cui assegnare l'istituto dimostrativo.\n" +
        "Esempio: pnpm demo:seed tua@email.it",
    );
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (azione === "seed") await seed(client, email);
    else await clean(client);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
