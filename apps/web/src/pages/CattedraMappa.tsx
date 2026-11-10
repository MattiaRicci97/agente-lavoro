import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListClasses } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Grid3x3, Sparkles, Loader2, Users, Save } from "lucide-react";
import { ERROR_TYPE_LABEL, type DiagnosisErrorType } from "@/lib/diagnosis";
import { STATE_LABEL, PRACTICE_ONLY_LABEL } from "@/lib/mastery";

interface MapObjective {
  id: number;
  code: string;
  title: string;
  counts: { acquisito: number; fragile: number; mancante: number; inEsercizio: number };
  assessed: number;
  commonErrors: Array<{ errorType: string; students: number; percent: number }>;
  groupStudentIds: number[];
  activity: { aiDraft: string; body: string } | null;
}

interface ClassMap {
  class: { id: number; name: string; gradeLevel: string };
  subjects: string[];
  subject: string | null;
  students: Array<{ id: number; name: string }>;
  objectives: MapObjective[];
  cells: Record<string, Record<string, string>>;
}

const CELL: Record<string, { cls: string; label: string }> = {
  acquisito: { cls: "bg-emerald-500", label: STATE_LABEL.acquisito },
  fragile: { cls: "bg-amber-400", label: STATE_LABEL.fragile },
  mancante: { cls: "bg-rose-500", label: STATE_LABEL.mancante },
  in_esercizio: { cls: "bg-slate-300", label: PRACTICE_ONLY_LABEL },
};

/** Gruppo di recupero e attivita' in classe per un obiettivo. */
function ObjectivePanel({ classId, o, names }: { classId: number; o: MapObjective; names: Map<number, string> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState(o.activity?.body ?? "");
  useEffect(() => setBody(o.activity?.body ?? ""), [o.activity?.body]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["classMap", classId] });
  const onError = (err: any) =>
    toast({ title: "Operazione non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" });

  const draft = useMutation({
    mutationFn: () =>
      customFetch(`/api/classes/${classId}/objectives/${o.id}/activity-draft`, { method: "POST", responseType: "json" }),
    onSuccess: invalidate,
    onError,
  });
  const save = useMutation({
    mutationFn: () =>
      customFetch(`/api/classes/${classId}/objectives/${o.id}/activity`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
        responseType: "json",
      }),
    onSuccess: () => {
      void invalidate();
      toast({ title: "Attivita' salvata" });
    },
    onError,
  });

  const dirty = body !== (o.activity?.body ?? "");
  const hasNewProposal = !!o.activity && o.activity.aiDraft && o.activity.aiDraft !== o.activity.body;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <span className="mr-2 font-mono text-xs text-muted-foreground">{o.code}</span>
          {o.title}
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
          <span>{o.assessed} valutati</span>
          <span className="text-emerald-700">{o.counts.acquisito} acquisito</span>
          <span className="text-amber-700">{o.counts.fragile} fragile</span>
          <span className="text-rose-700">{o.counts.mancante} da costruire</span>
          {o.counts.inEsercizio > 0 && <span>{o.counts.inEsercizio} solo in esercizio</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {o.commonErrors.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Errori comuni</div>
            {o.commonErrors.map((e) => (
              <div key={e.errorType} className="flex items-center gap-3 text-sm">
                <span className="w-56 shrink-0">{ERROR_TYPE_LABEL[e.errorType as DiagnosisErrorType] ?? e.errorType}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${e.percent}%` }} />
                </div>
                <span className="w-32 shrink-0 text-right text-xs text-muted-foreground">
                  {e.percent}% · {e.students} {e.students === 1 ? "studente" : "studenti"}
                </span>
              </div>
            ))}
          </div>
        )}

        {o.groupStudentIds.length > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-4 w-4" /> Gruppo di recupero proposto ({o.groupStudentIds.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {o.groupStudentIds.map((id) => (
                <Link key={id} href={`/cattedra/registro/studente/${id}`}>
                  <Badge variant="outline" className="cursor-pointer bg-card font-normal hover:bg-muted">
                    {names.get(id) ?? id}
                  </Badge>
                </Link>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Hanno la stessa lacuna su questo obiettivo. E' una proposta: il gruppo lo componi tu.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessuno da recuperare su questo obiettivo.</p>
        )}

        {o.groupStudentIds.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm">Attivita' in classe (circa 10 minuti)</Label>
              <Button size="sm" variant="outline" onClick={() => draft.mutate()} disabled={draft.isPending}>
                {draft.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {o.activity?.aiDraft ? "Chiedi un'altra bozza" : "Chiedi una bozza all'assistente"}
              </Button>
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={body ? 7 : 3}
              placeholder="Scrivi qui la tua attivita', o chiedi una bozza all'assistente e poi adattala."
            />
            {hasNewProposal && (
              <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center justify-between">
                  <span>Ultima bozza dell'assistente (il tuo testo non e' stato toccato)</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setBody(o.activity!.aiDraft)}>
                    Usa questa
                  </Button>
                </div>
                <p className="whitespace-pre-wrap">{o.activity!.aiDraft}</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Resta a te: agli studenti non arriva nulla da qui.</span>
              <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Salva
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CattedraMappa() {
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const [classId, setClassId] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const activeClassId = classId ?? classes?.[0]?.id ?? null;

  const { data: map, isLoading } = useQuery({
    queryKey: ["classMap", activeClassId, subject],
    enabled: activeClassId !== null,
    queryFn: () =>
      customFetch<ClassMap>(
        `/api/classes/${activeClassId}/mastery-map${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`,
        { responseType: "json" },
      ),
  });
  const names = new Map((map?.students ?? []).map((s) => [s.id, s.name]));

  return (
    <TeacherLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Grid3x3 className="h-7 w-7 text-primary" /> Mappa della classe
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Obiettivo per obiettivo, a che punto e' ciascuno secondo le verifiche che hai firmato. I colori parlano
            degli obiettivi, non delle persone.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 min-w-56">
              <Label>Classe</Label>
              <Select
                value={activeClassId !== null ? String(activeClassId) : undefined}
                onValueChange={(v) => {
                  setClassId(Number(v));
                  setSubject(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scegli" />
                </SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} — {c.gradeLevel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {map && map.subjects.length > 1 && (
              <div className="space-y-1.5 min-w-48">
                <Label>Materia</Label>
                <Select value={map.subject ?? undefined} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {map.subjects.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {Object.entries(CELL).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={`inline-block h-3 w-3 rounded-sm ${v.cls}`} /> {v.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border" /> Nessun dato
              </span>
            </div>
          </CardContent>
        </Card>

        {classesLoading || isLoading ? (
          <Skeleton className="h-72" />
        ) : !map || !map.objectives.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Ancora nessun dato: la mappa si riempie quando firmi correzioni con una diagnosi per obiettivo.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 overflow-x-auto">
                <table className="text-sm border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="text-left font-medium pr-4 sticky left-0 bg-card">Studente</th>
                      {map.objectives.map((o) => (
                        <th key={o.id} className="font-mono text-[11px] font-normal text-muted-foreground px-1" title={o.title}>
                          {o.code.replace(/^[A-Z]+\d\./, "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {map.students.map((s) => (
                      <tr key={s.id}>
                        <td className="pr-4 whitespace-nowrap sticky left-0 bg-card">
                          <Link href={`/cattedra/registro/studente/${s.id}`} className="hover:underline">
                            {s.name}
                          </Link>
                        </td>
                        {map.objectives.map((o) => {
                          const state = map.cells[s.id]?.[o.id];
                          const cell = state ? CELL[state] : null;
                          return (
                            <td key={o.id} className="text-center">
                              <span
                                className={`inline-block h-6 w-10 rounded ${cell ? cell.cls : "border"}`}
                                title={`${s.name} · ${o.title}: ${cell ? cell.label : "nessun dato"}`}
                                aria-label={cell ? cell.label : "nessun dato"}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {map.objectives.map((o) => (
                <ObjectivePanel key={o.id} classId={map.class.id} o={o} names={names} />
              ))}
            </div>
          </>
        )}
      </div>
    </TeacherLayout>
  );
}
