import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Target } from "lucide-react";
import { STATE_LABEL, STATE_TONE, PRACTICE_ONLY_LABEL, PRACTICE_ONLY_TONE, type MasteryRow } from "@/lib/mastery";

/**
 * Il profilo di padronanza: una riga per obiettivo, con le due fonti tenute
 * distinte (verifiche firmate dal docente, pratica autonoma). L'etichetta e'
 * dell'obiettivo: non esiste un giudizio complessivo sulla persona.
 */
export function MasteryList({ rows, audience }: { rows: MasteryRow[]; audience: "docente" | "studente" }) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-primary" />
          {audience === "docente" ? "Padronanza per obiettivo" : "I tuoi obiettivi"}
        </CardTitle>
        <CardDescription>
          {audience === "docente"
            ? "Lo stato viene dalle verifiche che hai firmato. La pratica autonoma e' mostrata a parte e non entra nel registro."
            : "Lo stato viene dalle verifiche corrette dal docente. La pratica ti aiuta a consolidare, ma non e' un voto."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.objective.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
            <span
              className={
                "rounded-full border px-2 py-0.5 text-xs font-medium " +
                (r.state ? STATE_TONE[r.state] : PRACTICE_ONLY_TONE)
              }
            >
              {r.state ? STATE_LABEL[r.state] : PRACTICE_ONLY_LABEL}
            </span>
            <span className="min-w-0 flex-1">
              {audience === "docente" && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{r.objective.code}</span>}
              {r.objective.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {r.signed.total > 0 && <>verifiche {r.signed.correct}/{r.signed.total}</>}
              {r.signed.total > 0 && r.practice.total > 0 && " · "}
              {r.practice.total > 0 && <>pratica {r.practice.correct}/{r.practice.total}</>}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
