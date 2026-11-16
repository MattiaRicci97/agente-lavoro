/**
 * La cassetta degli attrezzi del docente attorno a un materiale. Qui stanno
 * le regole che non dipendono dal database: quali strumenti esistono, quali
 * si possono condividere con gli studenti, in quali lingue si traduce.
 */
export const TOOL_KINDS = ["errori_tipici", "spunti", "glossario", "traduzione"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

/** Solo questi arrivano agli studenti, e solo se il docente lo decide. */
export const SHAREABLE_KINDS: ReadonlySet<ToolKind> = new Set(["glossario", "traduzione"]);

export const TRANSLATION_LANGUAGES = [
  "Inglese",
  "Francese",
  "Spagnolo",
  "Rumeno",
  "Albanese",
  "Arabo",
  "Cinese",
  "Ucraino",
  "Urdu",
  "Bengalese",
] as const;

export function isToolKind(value: string): value is ToolKind {
  return (TOOL_KINDS as readonly string[]).includes(value);
}

/** Che cosa chiedere all'assistente per ciascuno strumento. */
export const TOOL_INSTRUCTIONS: Record<ToolKind, string> = {
  errori_tipici:
    "Elenca da 4 a 6 errori o misconcezioni tipiche degli studenti su questo argomento. Per ciascuno: l'errore, perche' nasce, " +
    "e una mossa concreta con cui il docente puo' prevenirlo o farlo emergere in classe. Parla dell'errore, mai di chi lo commette.",
  spunti:
    "Proponi 3 modi diversi per aprire la lezione su questo argomento in cinque minuti: una domanda che spiazza, un collegamento " +
    "con la vita quotidiana degli studenti, un piccolo problema o caso da cui partire. Per ciascuno scrivi cosa dice o fa il docente.",
  glossario:
    "Scrivi il glossario dei termini chiave di questo materiale (da 8 a 15), in ordine alfabetico. Per ciascuno: una definizione " +
    "di una o due frasi adatta all'eta' degli studenti e, quando aiuta, un esempio breve. Usa solo cio' che c'e' nel materiale.",
  traduzione:
    "Scrivi una sintesi fedele del materiale (10-15 frasi brevi) nella lingua indicata, per uno studente arrivato da poco in Italia " +
    "o per la sua famiglia. Poi aggiungi un elenco bilingue dei 10 termini piu' importanti (italiano = traduzione). " +
    "Non aggiungere contenuti che nel materiale non ci sono.",
};
