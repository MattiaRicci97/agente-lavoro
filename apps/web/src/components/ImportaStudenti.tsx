import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface ParsedStudent {
  name: string;
  besDsa: boolean;
}

/**
 * Legge la lista incollata dal docente.
 *
 * Una riga per studente. Se dopo il nome c'è "BES" o "DSA" (dopo virgola,
 * punto e virgola o tabulazione — cioè il formato in cui esce un foglio Excel),
 * lo studente viene segnato come BES/DSA.
 */
function parseRoster(text: string): ParsedStudent[] {
  const out: ParsedStudent[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[;,\t]/).map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    const besDsa = parts.slice(1).some((p) => /^(bes|dsa|bes\/dsa|si|sì|x)$/i.test(p));
    out.push({ name: name.slice(0, 120), besDsa });
  }
  return out;
}

/** Import in blocco dell'elenco alunni di una classe. */
export function ImportaStudenti({ classId }: { classId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const parsed = parseRoster(text);

  const importStudents = useMutation({
    mutationFn: () =>
      customFetch<{ created: number; skipped: number }>(`/api/classes/${classId}/students/import`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ students: parsed }),
      }),
    onSuccess: (r) => {
      toast({
        title: "Elenco importato",
        description:
          `${r.created} student${r.created === 1 ? "e aggiunto" : "i aggiunti"}` +
          (r.skipped ? `, ${r.skipped} già presenti (saltati).` : "."),
      });
      setText("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["registro"] });
    },
    onError: (err: any) =>
      toast({
        title: "Import non riuscito",
        description: err?.data?.error ?? "Riprova.",
        variant: "destructive",
      }),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Importa elenco studenti
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">
        Incolla la lista, un nome per riga. Per segnare BES/DSA aggiungi <code>; BES</code> dopo il nome.
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Mario Rossi\nGiulia Bianchi; DSA\nLuca Verdi"}
        className="min-h-[140px] bg-card font-mono text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {parsed.length} student{parsed.length === 1 ? "e" : "i"} riconosciut{parsed.length === 1 ? "o" : "i"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button
            size="sm"
            onClick={() => importStudents.mutate()}
            disabled={importStudents.isPending || parsed.length === 0}
          >
            Importa {parsed.length || ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
