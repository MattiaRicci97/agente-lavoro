import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

/**
 * Gli aiuti progressivi di una domanda: lo studente bloccato ne chiede uno
 * alla volta, dal piu' leggero al piu' esplicito. Li ha scritti o approvati
 * il docente e non contengono la risposta. Se non ce ne sono, non compare nulla.
 */
export function HintLadder({ hints }: { hints?: string[] }) {
  const [shown, setShown] = useState(0);
  if (!hints?.length) return null;
  const hasMore = shown < hints.length;

  return (
    <div className="space-y-2">
      {hints.slice(0, shown).map((hint, i) => (
        <div key={i} className="rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
            Aiuto {i + 1} di {hints.length}
          </span>
          <span className="whitespace-pre-wrap">{hint}</span>
        </div>
      ))}
      {hasMore && (
        <Button type="button" variant="outline" size="sm" onClick={() => setShown(shown + 1)}>
          <Lightbulb className="mr-2 h-4 w-4" />
          {shown === 0 ? "Sono bloccato: dammi un aiuto" : "Un altro aiuto"}
        </Button>
      )}
    </div>
  );
}
