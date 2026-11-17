import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ListChecks, Sparkles, Loader2, Plus, Trash2, Check, Pencil } from "lucide-react";

export interface RubricCriterion {
  name: string;
  description: string;
  weight: number;
}

export interface RubricScore {
  criterion: string;
  score: number;
  note: string;
}

const MAX_CRITERIA = 8;

/** Media pesata dei punteggi, o null se ne manca qualcuno. */
export function weightedGrade(rubric: RubricCriterion[], scores: Record<string, number | null>): number | null {
  let sum = 0;
  for (const c of rubric) {
    const score = scores[c.name];
    if (score === null || score === undefined || Number.isNaN(score)) return null;
    sum += score * c.weight;
  }
  return Math.round((sum / 100) * 10) / 10;
}

/** La griglia in sola lettura: criteri, pesi e, se ci sono, i punteggi firmati. */
export function RubricTable({ rubric, scores }: { rubric: RubricCriterion[]; scores?: RubricScore[] }) {
  const byName = new Map((scores ?? []).map((s) => [s.criterion, s]));
  return (
    <ul className="divide-y rounded-lg border bg-card text-sm">
      {rubric.map((c) => {
        const s = byName.get(c.name);
        return (
          <li key={c.name} className="flex items-start gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {c.name} <span className="font-normal text-muted-foreground">· {c.weight}%</span>
              </div>
              {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
              {s?.note && <div className="mt-1 text-xs">{s.note}</div>}
            </div>
            {s && (
              <Badge variant="outline" className="shrink-0 tabular-nums">
                {s.score}/10
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La griglia di un compito nella pagina del docente: l'assistente la propone,
 * il docente la corregge e la approva. Con le prime consegne si blocca.
 */
export function RubricManager({
  examId,
  rubric,
  status,
  locked,
  onChanged,
}: {
  examId: number;
  rubric: RubricCriterion[] | null;
  status: "bozza" | "approvata" | null;
  locked: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<RubricCriterion[]>(rubric ?? []);

  const onError = (err: any) =>
    toast({ title: "Errore", description: err?.data?.error ?? "Operazione non riuscita.", variant: "destructive" });

  const draft = useMutation({
    mutationFn: () =>
      customFetch<{ rubric: RubricCriterion[] }>(`/api/written-exams/${examId}/rubric-draft`, { method: "POST", responseType: "json" }),
    onSuccess: (data) => {
      setRows(data.rubric);
      setEditing(true);
      onChanged();
    },
    onError,
  });

  const save = useMutation({
    mutationFn: (approved: boolean) =>
      customFetch(`/api/written-exams/${examId}/rubric`, {
        method: "PUT",
        responseType: "json",
        body: JSON.stringify({ criteria: rows.map((r) => ({ ...r, weight: Number(r.weight) || 0 })), approved }),
      }),
    onSuccess: (_data, approved) => {
      setEditing(false);
      toast({
        title: approved ? "Griglia approvata" : "Griglia salvata in bozza",
        description: approved
          ? "Gli studenti la vedono con la traccia e la correzione la userà come riferimento."
          : "Gli studenti non la vedono finché non la approvi.",
      });
      onChanged();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => customFetch(`/api/written-exams/${examId}/rubric`, { method: "DELETE", responseType: "json" }),
    onSuccess: () => {
      setRows([]);
      setEditing(false);
      onChanged();
    },
    onError,
  });

  const busy = draft.isPending || save.isPending || remove.isPending;
  const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const valid = rows.length >= 2 && rows.every((r) => r.name.trim().length >= 2 && Number(r.weight) > 0);

  function update(i: number, patch: Partial<RubricCriterion>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
        <div className="text-xs font-medium text-primary">Griglia di valutazione</div>
        {rows.map((r, i) => (
          <div key={i} className="space-y-1 rounded-md border bg-card p-2">
            <div className="flex gap-2">
              <Input value={r.name} maxLength={80} placeholder="Criterio" onChange={(e) => update(i, { name: e.target.value })} />
              <Input
                className="w-20"
                type="number"
                min={1}
                max={100}
                value={r.weight}
                aria-label="Peso in percentuale"
                onChange={(e) => update(i, { weight: Number(e.target.value) })}
              />
              <Button size="icon" variant="ghost" title="Togli il criterio" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={r.description}
              maxLength={400}
              placeholder="Che cosa si guarda nell'elaborato"
              onChange={(e) => update(i, { description: e.target.value })}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          {rows.length < MAX_CRITERIA && (
            <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { name: "", description: "", weight: 20 }])}>
              <Plus className="mr-1 h-3 w-3" /> Criterio
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Pesi: {total}%{total !== 100 && rows.length > 0 ? " (li riporto a 100 mantenendo le proporzioni)" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !valid} onClick={() => save.mutate(true)}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Approva
          </Button>
          <Button size="sm" variant="outline" disabled={busy || !valid} onClick={() => save.mutate(false)}>
            Salva in bozza
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRows(rubric ?? []);
              setEditing(false);
            }}
          >
            Annulla
          </Button>
        </div>
      </div>
    );
  }

  if (!rubric?.length) {
    if (locked) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => draft.mutate()}>
          {draft.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          Proponi una griglia
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            setRows([
              { name: "", description: "", weight: 50 },
              { name: "", description: "", weight: 50 },
            ]);
            setEditing(true);
          }}
        >
          <ListChecks className="mr-1 h-3 w-3" /> Scrivila tu
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">Griglia di valutazione</span>
        {status === "approvata" ? (
          <Badge variant="outline" className="border-green-200 bg-green-50 text-[10px] text-green-800">Approvata</Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800">
            Bozza, non visibile agli studenti
          </Badge>
        )}
        {locked ? (
          <span className="text-muted-foreground">bloccata: ci sono consegne</span>
        ) : (
          <span className="ml-auto flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Modifica la griglia"
              onClick={() => {
                setRows(rubric);
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Togli la griglia" disabled={busy} onClick={() => remove.mutate()}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        )}
      </div>
      <RubricTable rubric={rubric} />
    </div>
  );
}
