import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Undo2, X } from "lucide-react";
import {
  OUTCOME_LABEL,
  ERROR_TYPE_LABEL,
  type DiagnosisRow,
  type DiagnosisDecision,
  type DiagnosisOutcome,
  type DiagnosisErrorType,
  type ObjectiveRef,
} from "@/lib/diagnosis";

const OUTCOMES: DiagnosisOutcome[] = ["corretto", "parziale", "errato"];
const ERROR_TYPES: DiagnosisErrorType[] = ["concettuale", "procedurale", "distrazione", "non_classificato"];
const NONE = "__none__";

interface RowState {
  objectiveId: number | null;
  outcome: DiagnosisOutcome;
  errorType: DiagnosisErrorType | null;
  discard: boolean;
}

function initial(row: DiagnosisRow): RowState {
  return {
    objectiveId: row.ai.objective?.id ?? null,
    outcome: row.ai.outcome,
    errorType: row.ai.outcome === "corretto" ? null : (row.ai.errorType ?? "non_classificato"),
    discard: false,
  };
}

function toDecisions(rows: DiagnosisRow[], state: Record<number, RowState>): DiagnosisDecision[] {
  const out: DiagnosisDecision[] = [];
  for (const row of rows) {
    const s = state[row.id];
    if (!s) continue;
    const base = initial(row);
    if (s.discard) {
      out.push({ id: row.id, discard: true });
      continue;
    }
    const changed =
      s.objectiveId !== base.objectiveId || s.outcome !== base.outcome || s.errorType !== base.errorType;
    if (changed) {
      out.push({ id: row.id, objectiveId: s.objectiveId, outcome: s.outcome, errorType: s.errorType });
    }
  }
  return out;
}

/**
 * La diagnosi proposta dall'assistente, riga per riga, con i comandi minimi
 * per confermarla o correggerla in pochi clic. Le decisioni escono insieme
 * alla firma del voto: non esiste una diagnosi firmata senza voto firmato.
 */
export function DiagnosisEditor({
  rows,
  options,
  onChange,
}: {
  rows: DiagnosisRow[];
  options: ObjectiveRef[];
  onChange: (decisions: DiagnosisDecision[]) => void;
}) {
  const [state, setState] = useState<Record<number, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, initial(r)])),
  );

  useEffect(() => {
    onChange(toDecisions(rows, state));
    // onChange e' stabile per costruzione nel chiamante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, rows]);

  if (!rows.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Nessuna diagnosi per esercizio: l'assistente non ha trovato obiettivi nella mappa per questa materia.
      </p>
    );
  }

  const update = (id: number, patch: Partial<RowState>) =>
    setState((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));

  const optionById = new Map(options.map((o) => [o.id, o]));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Target className="h-4 w-4" />
        Diagnosi per esercizio
        <span className="ml-auto text-xs font-normal">
          Conferma così com'è o correggi; allo studente arriva la tua versione.
        </span>
      </div>
      {rows.map((row) => {
        const s = state[row.id];
        const proposed = row.ai.objective;
        const currentObjective = s.objectiveId !== null ? (optionById.get(s.objectiveId) ?? proposed) : null;
        return (
          <div
            key={row.id}
            className={
              "rounded-lg border p-3 space-y-2 " + (s.discard ? "opacity-50 bg-muted/40" : "bg-card")
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">{row.exercise}</span>
              {currentObjective ? (
                <Badge variant="outline" className="font-normal" title={currentObjective.title}>
                  <span className="font-mono mr-1">{currentObjective.code}</span>
                  {currentObjective.title}
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-normal">
                  obiettivo non individuato
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                {s.discard ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => update(row.id, { discard: false })}>
                    <Undo2 className="mr-1 h-3 w-3" /> Ripristina
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    title="Questa riga non descrive davvero l'elaborato"
                    onClick={() => update(row.id, { discard: true })}
                  >
                    <X className="mr-1 h-3 w-3" /> Scarta
                  </Button>
                )}
              </div>
            </div>

            {row.ai.evidence && (
              <p className="text-xs text-muted-foreground italic border-l-2 pl-2">"{row.ai.evidence}"</p>
            )}

            {!s.discard && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border overflow-hidden">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() =>
                        update(row.id, {
                          outcome: o,
                          errorType: o === "corretto" ? null : (s.errorType ?? "non_classificato"),
                        })
                      }
                      className={
                        "px-2.5 py-1 text-xs transition-colors " +
                        (s.outcome === o ? "bg-primary text-primary-foreground" : "hover:bg-muted")
                      }
                    >
                      {OUTCOME_LABEL[o]}
                    </button>
                  ))}
                </div>

                {s.outcome !== "corretto" && (
                  <Select
                    value={s.errorType ?? "non_classificato"}
                    onValueChange={(v) => update(row.id, { errorType: v as DiagnosisErrorType })}
                  >
                    <SelectTrigger className="h-8 w-56 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ERROR_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {ERROR_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {options.length > 0 && (
                  <Select
                    value={s.objectiveId !== null ? String(s.objectiveId) : NONE}
                    onValueChange={(v) => update(row.id, { objectiveId: v === NONE ? null : Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-72 text-xs">
                      <SelectValue placeholder="Obiettivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} className="text-xs">
                        Nessun obiettivo
                      </SelectItem>
                      {options.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)} className="text-xs">
                          <span className="font-mono mr-1">{o.code}</span> {o.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
