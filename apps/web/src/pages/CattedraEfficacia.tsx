import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useListInstitutions } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Download } from "lucide-react";

interface Totals {
  sets: number;
  students: number;
  gaps: number;
  gapsAssessed: number;
  gapsRecovered: number;
  recoveredPercent: number | null;
  avgRecoveryDays: number | null;
  gradeDelta: number | null;
  itemsDue: number;
  itemsDone: number;
  participationPercent: number | null;
}

interface Report {
  institution: string;
  scope: "istituto" | "mie_classi";
  totals: Totals;
  classes: Array<Totals & { classId: number; className: string }>;
  sets: Array<{
    setId: number;
    className: string;
    title: string;
    approvedAt: string | null;
    followupAssigned: boolean;
    gaps: number;
    gapsAssessed: number;
    gapsRecovered: number;
    recoveredPercent: number | null;
    avgRecoveryDays: number | null;
    gradeDelta: number | null;
    participationPercent: number | null;
  }>;
}

const num = (v: number | null, suffix = "") => (v === null ? "—" : `${String(v).replace(".", ",")}${suffix}`);
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${String(v).replace(".", ",")}`);

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

export default function CattedraEfficacia() {
  const { toast } = useToast();
  const { data: institutions } = useListInstitutions();
  const institutionId = institutions?.[0]?.id;
  const [anonymize, setAnonymize] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["recoveryMetrics", institutionId, anonymize],
    enabled: !!institutionId,
    queryFn: () =>
      customFetch<Report>(`/api/institutions/${institutionId}/recovery-metrics${anonymize ? "?anonymize=1" : ""}`, {
        responseType: "json",
      }),
  });

  // Il download passa da una fetch autenticata, come per il registro.
  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await customFetch<Blob>(
        `/api/institutions/${institutionId}/recovery-metrics/export${anonymize ? "?anonymize=1" : ""}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `efficacia-recupero${anonymize ? "-anonimo" : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Esportazione non riuscita", description: "Riprova.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const t = data?.totals;

  return (
    <TeacherLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <LineChart className="h-7 w-7 text-primary" /> Efficacia del recupero
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Quanto funziona il ciclo verifica, recupero, riscontro. Solo numeri aggregati per classe: servono a
              valutare lo strumento, non le persone.
              {data?.scope === "mie_classi" && " Vedi le classi in cui insegni."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="anon" checked={anonymize} onCheckedChange={setAnonymize} />
              <Label htmlFor="anon" className="text-sm">Anonimizza</Label>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={exporting || !data?.sets.length}>
              <Download className="mr-2 h-4 w-4" /> Esporta CSV
            </Button>
          </div>
        </div>

        {isLoading || !institutionId ? (
          <Skeleton className="h-64" />
        ) : !data || !t || !data.sets.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Ancora nessun recupero approvato: le metriche compaiono dal primo ciclo.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Tile
                label="Obiettivi recuperati"
                value={num(t.recoveredPercent, "%")}
                hint={`${t.gapsRecovered} su ${t.gapsAssessed} verificati al riscontro (${t.gaps} a recupero)`}
              />
              <Tile label="Tempo medio di recupero" value={num(t.avgRecoveryDays, " gg")} hint="dall'approvazione al riscontro riuscito" />
              <Tile label="Variazione del voto" value={signed(t.gradeDelta)} hint="tra prima verifica e riscontro, stessi studenti" />
              <Tile label="Partecipazione" value={num(t.participationPercent, "%")} hint={`${t.itemsDone} richiami svolti su ${t.itemsDue} dovuti`} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per recupero</CardTitle>
                <CardDescription>Una riga per ogni set approvato. "—" significa che il riscontro non e' ancora stato firmato.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Classe</th>
                      <th className="py-2 pr-4 font-medium">Recupero</th>
                      <th className="py-2 pr-4 font-medium text-right">A recupero</th>
                      <th className="py-2 pr-4 font-medium text-right">Recuperati</th>
                      <th className="py-2 pr-4 font-medium text-right">Giorni</th>
                      <th className="py-2 pr-4 font-medium text-right">Voto</th>
                      <th className="py-2 font-medium text-right">Partecip.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sets.map((r) => (
                      <tr key={r.setId} className="border-t">
                        <td className="py-2 pr-4 whitespace-nowrap">{r.className}</td>
                        <td className="py-2 pr-4">{r.title}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{r.gaps}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {r.gapsAssessed ? `${r.gapsRecovered}/${r.gapsAssessed} (${num(r.recoveredPercent, "%")})` : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{num(r.avgRecoveryDays)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{signed(r.gradeDelta)}</td>
                        <td className="py-2 text-right tabular-nums">{num(r.participationPercent, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TeacherLayout>
  );
}
