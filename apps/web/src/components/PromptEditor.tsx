import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Loader2 } from "lucide-react";

/**
 * La traccia di un compito, che il docente puo' rileggere e correggere
 * finche' nessuno ha consegnato: la prima stesura e' dell'assistente.
 */
export function PromptEditor({
  examId,
  prompt,
  locked,
  highlight,
  onChanged,
}: {
  examId: number;
  prompt: string;
  locked: boolean;
  /** true per invitare a rileggere (es. una simulazione appena generata). */
  highlight?: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(prompt);

  const save = useMutation({
    mutationFn: () =>
      customFetch(`/api/written-exams/${examId}/prompt`, {
        method: "PUT",
        responseType: "json",
        body: JSON.stringify({ prompt: text.trim() }),
      }),
    onSuccess: () => {
      setEditing(false);
      toast({ title: "Traccia aggiornata", description: "Gli studenti vedono la tua versione." });
      onChanged();
    },
    onError: (err: any) =>
      toast({ title: "Errore", description: err?.data?.error ?? "Impossibile salvare la traccia.", variant: "destructive" }),
  });

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[260px] text-xs leading-relaxed" />
        <div className="flex gap-2">
          <Button size="sm" disabled={save.isPending || text.trim().length < 20} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva la traccia
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(prompt);
              setEditing(false);
            }}
          >
            Annulla
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{prompt}</div>
      {!locked && highlight && (
        <p className="mt-1 text-xs text-amber-800">L'ha scritta l'assistente: controlla i testi citati prima che la svolgano.</p>
      )}
      {!locked && (
        <Button
          size="sm"
          variant={highlight ? "outline" : "ghost"}
          className="mt-1 h-7 px-2 text-xs"
          onClick={() => {
            setText(prompt);
            setEditing(true);
          }}
        >
          <Pencil className="mr-1 h-3 w-3" />
          {highlight ? "Rileggi la traccia" : "Leggi e modifica la traccia"}
        </Button>
      )}
    </div>
  );
}
