import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListInstitutions } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Target, Sparkles, Loader2, Check, X, Pencil } from "lucide-react";

interface LinkedObjective {
  id: number;
  code: string;
  title: string;
  subject: string;
  gradeLevel: string;
  source: "ai" | "docente";
}

interface MapObjective {
  id: number;
  code: string;
  title: string;
  gradeLevel: string;
  active: boolean;
}

/**
 * Gli obiettivi che un materiale copre. L'assistente puo' proporli, ma
 * l'elenco che vale e' quello che il docente conferma.
 */
export function MaterialObjectives({ materialId, subject }: { materialId: number; subject: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: institutions } = useListInstitutions();
  const institutionId = institutions?.[0]?.id;

  const linkedKey = ["materialObjectives", materialId];
  const { data: linkedData } = useQuery({
    queryKey: linkedKey,
    queryFn: () =>
      customFetch<{ objectives: LinkedObjective[] }>(`/api/materials/${materialId}/objectives`, { responseType: "json" }),
  });
  const linked = linkedData?.objectives ?? [];

  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [suggestedIds, setSuggestedIds] = useState<number[]>([]);

  const { data: mapData, isLoading: mapLoading } = useQuery({
    queryKey: ["objectives", institutionId, subject, "forMaterial"],
    enabled: editing && !!institutionId,
    queryFn: () =>
      customFetch<{ objectives: MapObjective[] }>(
        `/api/institutions/${institutionId}/objectives?subject=${encodeURIComponent(subject)}`,
        { responseType: "json" },
      ),
  });
  const map = mapData?.objectives ?? [];

  const save = useMutation({
    mutationFn: (objectiveIds: number[]) =>
      customFetch(`/api/materials/${materialId}/objectives`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectiveIds }),
        responseType: "json",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: linkedKey });
      setEditing(false);
      setSuggestedIds([]);
      toast({ title: "Obiettivi aggiornati" });
    },
    onError: (err: unknown) =>
      toast({ title: "Non salvato", description: err instanceof Error ? err.message : "Riprova.", variant: "destructive" }),
  });

  const suggest = useMutation({
    mutationFn: () =>
      customFetch<{ suggestions: Array<{ id: number }>; reason?: string }>(`/api/materials/${materialId}/objectives/suggest`, {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: (data) => {
      const ids = data.suggestions.map((s) => s.id);
      setSuggestedIds(ids);
      setSelectedIds((cur) => Array.from(new Set([...cur, ...ids])));
      if (!ids.length) toast({ title: "Nessuna proposta", description: data.reason ?? "L'assistente non ha trovato obiettivi adatti." });
    },
    onError: (err: unknown) =>
      toast({ title: "Proposta non riuscita", description: err instanceof Error ? err.message : "Riprova.", variant: "destructive" }),
  });

  function startEditing() {
    setSelectedIds(linked.map((o) => o.id));
    setSuggestedIds([]);
    setEditing(true);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-muted-foreground" />
        {linked.length ? (
          linked.map((o) => (
            <Badge key={o.id} variant="outline" className="font-normal" title={o.title}>
              <span className="font-mono mr-1">{o.code}</span> {o.title}
              {o.source === "ai" && <span className="ml-1 text-muted-foreground">(proposta)</span>}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">Nessun obiettivo collegato</span>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={startEditing}>
          <Pencil className="mr-1 h-3 w-3" /> Obiettivi
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Target className="h-4 w-4 text-primary" /> Quali obiettivi copre questo materiale?
        </div>
        <Button size="sm" variant="outline" onClick={() => suggest.mutate()} disabled={suggest.isPending || !institutionId}>
          {suggest.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          Chiedi una proposta
        </Button>
      </div>

      {mapLoading ? (
        <div className="text-xs text-muted-foreground">Carico la mappa…</div>
      ) : !map.length ? (
        <div className="text-xs text-muted-foreground">
          Nessun obiettivo nella mappa per "{subject}". Aggiungili da Cattedra → Obiettivi.
        </div>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {map
            .filter((o) => o.active || selectedIds.includes(o.id))
            .map((o) => {
              const on = selectedIds.includes(o.id);
              const proposed = suggestedIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedIds((cur) => (on ? cur.filter((id) => id !== o.id) : [...cur, o.id]))}
                  className={
                    "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors " +
                    (on ? "border-primary bg-primary/5" : "hover:bg-muted")
                  }
                >
                  <span className={"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border " + (on ? "border-primary bg-primary text-primary-foreground" : "")}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{o.code}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{o.gradeLevel}</span>
                    {proposed && <span className="ml-1.5 text-xs text-primary">proposta</span>}
                    <div className="leading-snug">{o.title}</div>
                  </span>
                </button>
              );
            })}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => save.mutate(selectedIds)} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
          Conferma
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="mr-1 h-3.5 w-3.5" /> Annulla
        </Button>
      </div>
    </div>
  );
}
