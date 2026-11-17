import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, FileText } from "lucide-react";

interface Participation {
  classes: Array<{ id: number; name: string; total: number; opened: number; notOpened: string[] }>;
  assignments: Array<{
    id: number;
    label: string;
    dueDate: string | null;
    expected: number;
    submitted: number;
    missing: Array<{ name: string; className: string }>;
  }>;
}

function Names({ names }: { names: string[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {names.map((n, i) => (
        <Badge key={`${n}-${i}`} variant="outline" className="font-normal">
          {n}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Chi non ha ancora aperto il materiale e chi non ha consegnato i compiti.
 * Sono fatti, utili prima di una lezione o di una scadenza: nessun punteggio.
 */
export function MaterialParticipation({ materialId }: { materialId: number }) {
  const { data } = useQuery({
    queryKey: ["materialParticipation", materialId],
    queryFn: () => customFetch<Participation>(`/api/materials/${materialId}/participation`, { responseType: "json" }),
  });
  if (!data || !data.classes.length) return null;
  const multi = data.classes.length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Partecipazione</CardTitle>
        <CardDescription>Chi ha aperto il materiale e chi ha consegnato. Lo vedi solo tu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.classes.map((c) => (
          <div key={c.id}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4 text-muted-foreground" />
              {c.name}: {c.opened} su {c.total} l'hanno aperto
            </div>
            {c.total === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nessuno studente in questa classe.</p>
            ) : c.notOpened.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">L'hanno aperto tutti.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">Non l'hanno ancora aperto:</p>
                <Names names={c.notOpened} />
              </>
            )}
          </div>
        ))}

        {data.assignments.map((a) => (
          <div key={a.id} className="border-t pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {a.label}: {a.submitted} su {a.expected} consegne
              {a.dueDate && (
                <span className="text-xs font-normal text-muted-foreground">
                  · entro il {new Date(`${a.dueDate}T00:00:00`).toLocaleDateString("it-IT")}
                </span>
              )}
            </div>
            {a.missing.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{a.expected === 0 ? "Nessuno studente con un account in classe." : "Hanno consegnato tutti."}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">Non hanno ancora consegnato:</p>
                <Names names={a.missing.map((m) => (multi ? `${m.name} (${m.className})` : m.name))} />
              </>
            )}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          "Aperto" vuol dire che lo studente è entrato in una pagina del materiale (quiz, compiti, orale, tutor o aiuti) da quando
          questa funzione è attiva.
        </p>
      </CardContent>
    </Card>
  );
}
