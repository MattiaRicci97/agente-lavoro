import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListClasses } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Compass, Loader2, Plus, Trash2, Users, FileText, Mic, ShieldCheck } from "lucide-react";

interface Options {
  subjects: string[];
  materials: Array<{ id: number; label: string; kind: string }>;
  objectives: Array<{ id: number; code: string; title: string; gradeLevel: string }>;
}

interface Summary {
  classSize: number;
  started: number;
  completed: number;
  detailAvailable: boolean;
  objectives: Array<{ id: number; code: string; title: string; sicuro: number; incerto: number }>;
  stuckPoints: Array<{ text: string; count: number }>;
}

interface Activity {
  id: number;
  subject: string;
  title: string;
  brief: string;
  dueDate: string | null;
  createdAt: string;
  materialsCount: number;
  summary: Summary;
}

function toggle(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Il riepilogo di classe: conteggi per obiettivo, mai per studente. */
function SummaryBlock({ s }: { s: Summary }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span>
          <strong>{s.completed}</strong> su {s.classSize} l'hanno completata
          {s.started > s.completed && ` · ${s.started - s.completed} in corso`}
        </span>
      </div>
      {!s.detailAvailable ? (
        <p className="text-xs text-muted-foreground">
          Il riepilogo compare da tre attività completate in su: con meno, parlerebbe dei singoli studenti.
        </p>
      ) : (
        <>
          {s.objectives.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Per obiettivo</div>
              {s.objectives.map((o) => {
                const touched = o.sicuro + o.incerto;
                return (
                  <div key={o.id} className="text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>{o.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {touched === 0 ? "non affrontato" : `${o.incerto} con incertezze · ${o.sicuro} sicuri`}
                      </span>
                    </div>
                    {touched > 0 && (
                      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
                        <div className="bg-amber-400" style={{ width: `${(o.incerto / touched) * 100}%` }} />
                        <div className="bg-emerald-500" style={{ width: `${(o.sicuro / touched) * 100}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dove ci si è bloccati</div>
            {s.stuckPoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun punto di blocco rilevato.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.stuckPoints.map((p) => (
                  <li key={p.text} className="flex items-baseline justify-between gap-3">
                    <span>{p.text}</span>
                    {p.count > 1 && <Badge variant="outline" className="shrink-0 tabular-nums">{p.count} studenti</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function CattedraAttivita() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const [classId, setClassId] = useState<number | null>(null);
  useEffect(() => {
    if (classId === null && classes?.length) setClassId(classes[0].id);
  }, [classes, classId]);

  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [materialIds, setMaterialIds] = useState<number[]>([]);
  const [objectiveIds, setObjectiveIds] = useState<number[]>([]);

  const listKey = ["guidedActivities", classId];
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    enabled: classId !== null,
    queryFn: () => customFetch<{ activities: Activity[] }>(`/api/classes/${classId}/guided-activities`, { responseType: "json" }),
  });
  const { data: options } = useQuery({
    queryKey: ["guidedOptions", classId, subject],
    enabled: classId !== null && creating,
    queryFn: () =>
      customFetch<Options>(`/api/classes/${classId}/guided-options?subject=${encodeURIComponent(subject)}`, { responseType: "json" }),
  });
  useEffect(() => {
    if (creating && !subject && options?.subjects.length) setSubject(options.subjects[0]);
  }, [creating, subject, options]);

  function reset() {
    setCreating(false);
    setTitle("");
    setBrief("");
    setDueDate("");
    setMaterialIds([]);
    setObjectiveIds([]);
  }

  const onError = (err: any) =>
    toast({ title: "Operazione non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" });

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/classes/${classId}/guided-activities`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ subject, title: title.trim(), brief: brief.trim(), materialIds, objectiveIds, dueDate: dueDate || null }),
      }),
    onSuccess: () => {
      toast({ title: "Attività assegnata", description: "La classe la trova in bacheca e in Chiedi al corso." });
      reset();
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/guided-activities/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    onError,
  });

  const canCreate = title.trim().length >= 3 && brief.trim().length >= 10 && materialIds.length > 0 && !!subject;
  const activities = data?.activities ?? [];

  return (
    <TeacherLayout>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-primary flex items-center gap-2">
              <Compass className="h-7 w-7" /> Attività guidate
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Scegli l'argomento e i materiali: ogni studente ci lavora con l'assistente, che lo guida con domande restando
              dentro quei materiali. A te torna un riepilogo della classe.
            </p>
          </div>
          {classes && classes.length > 0 && (
            <Select
              value={classId !== null ? String(classId) : undefined}
              onValueChange={(v) => {
                setClassId(Number(v));
                setSubject("");
                reset();
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Classe" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            È pratica: non produce voti e non entra nel registro né nel profilo degli studenti. Le conversazioni non vengono
            conservate; il riepilogo mostra solo conteggi per obiettivo, mai il singolo studente.
          </span>
        </div>

        {classesLoading ? (
          <Skeleton className="h-40" />
        ) : !classes?.length ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed text-muted-foreground">
            Crea prima una classe per assegnare un'attività.
          </div>
        ) : creating ? (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg">Nuova attività guidata</CardTitle>
              <CardDescription>La consegna la scrivi tu: l'assistente la segue e non esce da lì.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {options && options.subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Questa classe non ha ancora materiali condivisi: carica un materiale e assegnalo alla classe, poi torna qui.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Materia</Label>
                      <Select
                        value={subject || undefined}
                        onValueChange={(v) => {
                          setSubject(v);
                          setMaterialIds([]);
                          setObjectiveIds([]);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Scegli" />
                        </SelectTrigger>
                        <SelectContent>
                          {(options?.subjects ?? []).map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="guided-due">Entro il (facoltativo)</Label>
                      <Input id="guided-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="guided-title">Titolo</Label>
                    <Input
                      id="guided-title"
                      value={title}
                      maxLength={140}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="es. Il verso nelle disequazioni"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="guided-brief">Consegna</Label>
                    <Textarea
                      id="guided-brief"
                      value={brief}
                      maxLength={1500}
                      onChange={(e) => setBrief(e.target.value)}
                      className="min-h-[90px]"
                      placeholder="Su cosa devono lavorare e che cosa devono saper fare alla fine. es. Ripassa quando e perché si inverte il verso, poi risolvi due disequazioni spiegando ogni passaggio."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Materiali su cui lavorare</Label>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border p-3">
                      {(options?.materials ?? []).map((m) => (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox checked={materialIds.includes(m.id)} onCheckedChange={() => setMaterialIds(toggle(materialIds, m.id))} />
                          {m.kind === "lezione" ? <Mic className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {(options?.objectives.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Obiettivi della mappa (facoltativi, fino a 8): servono al riepilogo</Label>
                      <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border p-3">
                        {options!.objectives.map((o) => (
                          <label key={o.id} className="flex cursor-pointer items-start gap-2 text-sm">
                            <Checkbox
                              className="mt-0.5"
                              checked={objectiveIds.includes(o.id)}
                              disabled={!objectiveIds.includes(o.id) && objectiveIds.length >= 8}
                              onCheckedChange={() => setObjectiveIds(toggle(objectiveIds, o.id))}
                            />
                            <span>
                              {o.title} <span className="text-xs text-muted-foreground">· {o.gradeLevel}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={reset}>
                  Annulla
                </Button>
                <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending}>
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Compass className="mr-2 h-4 w-4" />}
                  Assegna alla classe
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuova attività guidata
          </Button>
        )}

        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          activities.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg">{a.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {a.subject} · {a.materialsCount} {a.materialsCount === 1 ? "materiale" : "materiali"}
                      {a.dueDate && ` · entro il ${new Date(`${a.dueDate}T00:00:00`).toLocaleDateString("it-IT")}`}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    title="Ritira l'attività"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(a.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.brief}</p>
                <SummaryBlock s={a.summary} />
              </CardContent>
            </Card>
          ))
        )}
        {!isLoading && classId !== null && activities.length === 0 && !creating && (
          <p className="text-center text-sm text-muted-foreground">Nessuna attività assegnata a questa classe.</p>
        )}
      </div>
    </TeacherLayout>
  );
}
