import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const MAX_HINTS = 3;

/** Toglie i campi vuoti prima di salvare. */
export function cleanHints(hints: string[]): string[] {
  return hints.map((h) => h.trim()).filter(Boolean).slice(0, MAX_HINTS);
}

/**
 * I tre campi con cui il docente scrive o corregge gli aiuti di una domanda:
 * dal piu' leggero al piu' esplicito. Quelli lasciati vuoti non vengono salvati.
 */
export function HintsEditor({ value, onChange }: { value: string[]; onChange: (hints: string[]) => void }) {
  const slots = Array.from({ length: MAX_HINTS }, (_, i) => value[i] ?? "");
  const placeholders = [
    "Primo aiuto: orienta (cosa richiamare alla mente)",
    "Secondo aiuto: il metodo o il passaggio da cui partire",
    "Terzo aiuto: avvicina, ma lascia l'ultimo passo allo studente",
  ];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Aiuti per chi si blocca (facoltativi, senza la risposta)</Label>
      {slots.map((hint, i) => (
        <Input
          key={i}
          value={hint}
          maxLength={300}
          placeholder={placeholders[i]}
          onChange={(e) => {
            const next = [...slots];
            next[i] = e.target.value;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

/** Gli aiuti in sola lettura, nella scheda di una domanda. */
export function HintsPreview({ hints, draft }: { hints?: string[]; draft?: boolean }) {
  if (!hints?.length) return null;
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <div className="mb-1 font-semibold uppercase tracking-wider">
        Aiuti{draft ? " · proposta dell'assistente, non ancora visibili agli studenti" : ""}
      </div>
      <ol className="list-decimal space-y-0.5 pl-4">
        {hints.map((h, i) => (
          <li key={i} className="whitespace-pre-wrap">{h}</li>
        ))}
      </ol>
    </div>
  );
}
