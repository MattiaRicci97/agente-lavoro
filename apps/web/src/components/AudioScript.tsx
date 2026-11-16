import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTextToSpeech } from "@/hooks/use-voice";
import { parseScript } from "@/lib/speechScript";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";

/**
 * Il ripasso da ascoltare: il copione scritto dal docente, letto dalla voce
 * del dispositivo una parte alla volta. Si puo' mettere in pausa, saltare
 * avanti e indietro, e seguire il testo mentre viene letto.
 */
export function AudioScript({ body, compact }: { body: string; compact?: boolean }) {
  const parts = useMemo(() => parseScript(body), [body]);
  const { supported, speak, stopSpeaking } = useTextToSpeech();
  const [partIndex, setPartIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // true dopo una pausa: il pulsante invita a riprendere, non a ricominciare.
  const [paused, setPaused] = useState(false);
  // Chi sta leggendo "adesso": cambiare questo numero ferma le letture precedenti.
  const runRef = useRef(0);

  useEffect(
    () => () => {
      runRef.current += 1;
      stopSpeaking();
    },
    [stopSpeaking],
  );

  function playFrom(index: number) {
    const run = (runRef.current += 1);
    stopSpeaking();
    setPaused(false);
    if (index >= parts.length) {
      setPlaying(false);
      setPartIndex(0);
      return;
    }
    setPartIndex(index);
    setPlaying(true);
    const sentences = parts[index].sentences;
    const next = (i: number) => {
      if (runRef.current !== run) return;
      if (i >= sentences.length) {
        playFrom(index + 1);
        return;
      }
      speak(sentences[i], () => next(i + 1));
    };
    // Lascia al motore vocale il tempo di chiudere la lettura precedente.
    window.setTimeout(() => next(0), 120);
  }

  function pause() {
    runRef.current += 1;
    stopSpeaking();
    setPlaying(false);
    setPaused(true);
  }

  if (!parts.length) return null;
  const current = parts[Math.min(partIndex, parts.length - 1)];
  const minutes = Math.max(1, Math.round(body.trim().split(/\s+/).length / 140));

  return (
    <div className="space-y-3">
      {supported ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
          <Button size="icon" variant="ghost" title="Parte precedente" disabled={partIndex === 0} onClick={() => (playing ? playFrom(partIndex - 1) : setPartIndex(partIndex - 1))}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button onClick={() => (playing ? pause() : playFrom(partIndex))}>
            {playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {playing ? "Pausa" : paused || partIndex > 0 ? "Riprendi" : "Ascolta"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Parte successiva"
            disabled={partIndex >= parts.length - 1}
            onClick={() => (playing ? playFrom(partIndex + 1) : setPartIndex(partIndex + 1))}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <div className="order-last min-w-0 basis-full text-sm sm:order-none sm:basis-0 sm:flex-1">
            <div className="truncate font-medium">{current.title}</div>
            <div className="text-xs text-muted-foreground">
              Parte {partIndex + 1} di {parts.length} · {minutes === 1 ? "circa un minuto" : `circa ${minutes} minuti`} in tutto
            </div>
          </div>
          <Volume2 className={`ml-auto h-4 w-4 shrink-0 sm:ml-0 ${playing ? "animate-pulse text-secondary" : "text-muted-foreground"}`} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Questo dispositivo non ha la lettura ad alta voce: puoi comunque leggere il testo qui sotto.
        </p>
      )}

      {!compact && (
        <div className="space-y-3">
          {parts.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (playing ? playFrom(i) : setPartIndex(i))}
              className={`block w-full rounded-lg border p-3 text-left text-sm transition-colors ${i === partIndex ? "border-secondary/50 bg-secondary/5" : "hover:bg-muted/40"}`}
            >
              <div className="font-medium">{p.title}</div>
              {p.text && <p className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">{p.text}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
