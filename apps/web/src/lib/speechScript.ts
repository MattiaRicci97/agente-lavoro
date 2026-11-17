/**
 * Prepara un copione per la lettura ad alta voce.
 *
 * Il testo e' diviso in parti (ogni parte comincia con una riga "## Titolo");
 * ogni parte viene poi spezzata in frasi, perche' i motori di sintesi vocale
 * dei browser si interrompono sui testi lunghi.
 */
export interface ScriptPart {
  title: string;
  /** Le frasi da leggere, titolo compreso. */
  sentences: string[];
  /** Il testo della parte, senza il titolo, da mostrare a schermo. */
  text: string;
}

const MAX_SENTENCE = 220;

function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*/g) ?? []) {
    let sentence = raw.trim();
    // Una frase troppo lunga si spezza alle virgole, poi agli spazi.
    while (sentence.length > MAX_SENTENCE) {
      const window = sentence.slice(0, MAX_SENTENCE);
      const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
      const at = cut > 40 ? cut + 1 : window.lastIndexOf(" ");
      if (at <= 0) break;
      out.push(sentence.slice(0, at).trim());
      sentence = sentence.slice(at).trim();
    }
    if (sentence) out.push(sentence);
  }
  return out;
}

export function parseScript(body: string): ScriptPart[] {
  const parts: ScriptPart[] = [];
  let title = "";
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (!title && !text) return;
    // Segni di formattazione che la voce leggerebbe ad alta voce.
    const spoken = text.replace(/[*_#`>]/g, "").replace(/^\s*[-•]\s+/gm, "");
    parts.push({
      title: title || `Parte ${parts.length + 1}`,
      // A schermo il testo compare senza i segni di grassetto e corsivo.
      text: text.replace(/[*_`]/g, ""),
      sentences: [...(title ? [`${title}.`] : []), ...splitSentences(spoken)],
    });
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,3}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      title = heading[1].replace(/[*_`]/g, "");
      lines = [];
    } else lines.push(line);
  }
  flush();
  return parts.filter((p) => p.sentences.length > 0);
}
