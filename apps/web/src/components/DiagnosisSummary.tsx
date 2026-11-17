import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, CircleDot, AlertCircle, Target } from "lucide-react";
import {
  OUTCOME_LABEL,
  OUTCOME_TONE,
  ERROR_TYPE_LABEL,
  ERROR_TYPE_STUDENT_HINT,
  type StudentDiagnosisRow,
} from "@/lib/diagnosis";

const ICON = {
  corretto: CheckCircle2,
  parziale: CircleDot,
  errato: AlertCircle,
} as const;

/**
 * Cosa dice la correzione firmata, esercizio per esercizio, nella lingua dello
 * studente: su quale obiettivo lavorare e che tipo di errore era. Parla sempre
 * dell'esercizio, mai dello studente.
 */
export function DiagnosisSummary({ rows }: { rows: StudentDiagnosisRow[] }) {
  if (!rows.length) return null;
  const toWork = rows.filter((r) => r.outcome !== "corretto");
  const objectives = Array.from(
    new Map(toWork.filter((r) => r.objective).map((r) => [r.objective!.id, r.objective!])).values(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {toWork.length ? "Su cosa lavorare" : "Tutto a posto"}
        </CardTitle>
        <CardDescription>
          {toWork.length
            ? objectives.length
              ? `Da riprendere: ${objectives.map((o) => o.title).join(", ")}.`
              : "Qualche esercizio da rivedere: ecco quali."
            : "Ogni esercizio ha centrato l'obiettivo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r, i) => {
          const Icon = ICON[r.outcome];
          return (
            <div key={i} className={"rounded-lg border p-3 text-sm " + OUTCOME_TONE[r.outcome]}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium">{r.exercise}</span>
                <span className="text-xs">· {OUTCOME_LABEL[r.outcome]}</span>
                {r.objective && <span className="text-xs opacity-80">· {r.objective.title}</span>}
              </div>
              {r.outcome !== "corretto" && r.errorType && (
                <p className="mt-1 text-xs">
                  <span className="font-medium">{ERROR_TYPE_LABEL[r.errorType]}</span>: {ERROR_TYPE_STUDENT_HINT[r.errorType]}.
                </p>
              )}
              {r.evidence && <p className="mt-1 text-xs italic opacity-80">"{r.evidence}"</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
