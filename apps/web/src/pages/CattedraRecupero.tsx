import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { LifeBuoy, Sparkles, Loader2, CheckCircle2, Pencil, Trash2, Plus, Users, X, CalendarClock } from "lucide-react";
import { ERROR_TYPE_LABEL, type DiagnosisErrorType } from "@/lib/diagnosis";

interface Question {
  id: number;
  question: string;
  answer: string;
  authorType: "ai" | "docente";
}

interface SetObjective {
  id: number;
  code: string;
  title: string;
  studentsCount: number;
  errorTypes: Record<string, number>;
  questions: Question[];
}

interface RecoverySet {
  id: number;
  className: string;
  title: string;
  status: "bozza" | "approvato";
  intervalsDays: number[];
  approvedAt: string | null;
  objectives: SetObjective[];
  studentsCount: number;
  progress: { done: number; total: number } | null;
}

function QuestionRow({
  q,
  editable,
  onSave,
  onDelete,
  busy,
}: {
  q: Question;
  editable: boolean;
  onSave: (id: number, body: { question: string; answer: string }) => Promise<unknown>;
  onDelete: (id: number) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(q.question);
  const [answer, setAnswer] = useState(q.answer);

  if (editing) {
    return (
      <div className="rounded-lg border p-3 space-y-2 bg-card">
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Risposta di riferimento" />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy || question.trim().length < 5 || !answer.trim()}
            onClick={async () => {
              await onSave(q.id, { question: question.trim(), answer: answer.trim() });
              setEditing(false);
            }}
          >
            Salva
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Annulla
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border p-3 text-sm bg-card">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap">{q.question}</p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">→ {q.answer}</p>
        {q.authorType === "ai" && <span className="mt-1 inline-block text-xs text-muted-foreground">proposta dell'assistente</span>}
      </div>
      {editable && (
        <div className="flex shrink-0">
          <Button size="icon" variant="ghost" title="Modifica" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Elimina" className="text-destructive" disabled={busy} onClick={() => onDelete(q.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AddQuestion({ onAdd, busy }: { onAdd: (body: { question: string; answer: string }) => Promise<unknown>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3 w-3" /> Aggiungi una domanda tua
      </Button>
    );
  }
  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Domanda" />
      <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Risposta di riferimento" />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || question.trim().length < 5 || !answer.trim()}
          onClick={async () => {
            await onAdd({ question: question.trim(), answer: answer.trim() });
            setQuestion("");
            setAnswer("");
            setOpen(false);
          }}
        >
          Aggiungi
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <X className="mr-1 h-3 w-3" /> Annulla
        </Button>
      </div>
    </div>
  );
}

function SetCard({ set }: { set: RecoverySet }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [intervals, setIntervals] = useState(set.intervalsDays.join(", "));
  const isDraft = set.status === "bozza";

  const call = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      customFetch<unknown>(path, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // L'eliminazione del set risponde 204, senza corpo.
        ...(method === "DELETE" && path.includes("recovery-sets") ? {} : { responseType: "json" as const }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recoverySets"] }),
    onError: (err: any) =>
      toast({ title: "Operazione non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" }),
  });

  const parsedIntervals = intervals
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const intervalsValid =
    parsedIntervals.length > 0 &&
    parsedIntervals.length <= 5 &&
    parsedIntervals.every((v, i) => i === 0 || v > parsedIntervals[i - 1]);
  const withQuestions = set.objectives.filter((o) => o.questions.length > 0).length;
  const missing = set.objectives.length - withQuestions;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{set.title}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2 mt-1">
              <span>{set.className}</span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {set.studentsCount} {set.studentsCount === 1 ? "studente" : "studenti"} con qualcosa da riprendere
              </span>
            </CardDescription>
          </div>
          {isDraft ? (
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Bozza: aspetta te</Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Approvato
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isDraft && set.progress && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Richiami a {set.intervalsDays.join(", ")} giorni
                {set.approvedAt && ` dal ${new Date(set.approvedAt).toLocaleDateString("it-IT")}`}
              </span>
              <span>
                {set.progress.done} di {set.progress.total} svolti
              </span>
            </div>
            <Progress value={set.progress.total ? (set.progress.done / set.progress.total) * 100 : 0} />
          </div>
        )}

        {isDraft && missing > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm">
            <span>
              {missing === set.objectives.length ? "Nessuna domanda ancora." : `${missing} obiettivi senza domande.`} L'assistente puo'
              proporle; tu le rileggi.
            </span>
            <Button size="sm" onClick={() => call.mutate({ path: `/api/recovery-sets/${set.id}/generate`, method: "POST" })} disabled={call.isPending}>
              {call.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Proponi le domande
            </Button>
          </div>
        )}

        {set.objectives.map((o) => (
          <div key={o.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{o.code}</span>
              <span className="font-medium">{o.title}</span>
              <Badge variant="outline" className="font-normal">
                {o.studentsCount} {o.studentsCount === 1 ? "studente" : "studenti"}
              </Badge>
              {Object.entries(o.errorTypes).map(([type, n]) => (
                <span key={type} className="text-xs text-muted-foreground">
                  {ERROR_TYPE_LABEL[type as DiagnosisErrorType] ?? type}: {n}
                </span>
              ))}
            </div>
            {o.questions.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                editable={isDraft}
                busy={call.isPending}
                onSave={(id, body) => call.mutateAsync({ path: `/api/recovery-questions/${id}`, method: "PATCH", body })}
                onDelete={(id) => call.mutate({ path: `/api/recovery-questions/${id}`, method: "DELETE" })}
              />
            ))}
            {isDraft && (
              <AddQuestion
                busy={call.isPending}
                onAdd={(body) => call.mutateAsync({ path: `/api/recovery-sets/${set.id}/questions`, method: "POST", body: { objectiveId: o.id, ...body } })}
              />
            )}
          </div>
        ))}

        {isDraft && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium">
                  <CalendarClock className="h-3.5 w-3.5" /> Richiami dopo (giorni)
                </label>
                <Input className="w-40 bg-card" value={intervals} onChange={(e) => setIntervals(e.target.value)} />
              </div>
              <p className="flex-1 text-xs text-muted-foreground min-w-48">
                Ogni studente riceve solo gli obiettivi della propria diagnosi, uno per giro. E' pratica: non crea voti e non
                entra nel registro. Nulla parte finche' non approvi.
              </p>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={call.isPending}
                onClick={() => {
                  if (window.confirm("Scartare questo recupero? Agli studenti non arrivera' nulla.")) {
                    call.mutate({ path: `/api/recovery-sets/${set.id}`, method: "DELETE" });
                  }
                }}
              >
                Non serve
              </Button>
              <Button
                disabled={call.isPending || !intervalsValid || withQuestions === 0}
                onClick={() =>
                  call.mutate(
                    { path: `/api/recovery-sets/${set.id}/approve`, method: "POST", body: { intervalsDays: parsedIntervals } },
                    { onSuccess: () => toast({ title: "Recupero approvato", description: "Gli studenti interessati sono stati avvisati." }) },
                  )
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approva e distribuisci
              </Button>
            </div>
            {!intervalsValid && <p className="text-xs text-destructive">Scrivi da 1 a 5 numeri crescenti, separati da virgola.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CattedraRecupero() {
  const { data, isLoading } = useQuery({
    queryKey: ["recoverySets"],
    queryFn: () => customFetch<{ sets: RecoverySet[] }>("/api/recovery-sets", { responseType: "json" }),
  });
  const sets = data?.sets ?? [];

  return (
    <TeacherLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LifeBuoy className="h-7 w-7 text-primary" /> Recupero
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Dopo ogni verifica firmata, Sillabo prepara un recupero per la classe sugli obiettivi rimasti fragili. Tu
            approvi un solo set; ogni studente riceve i richiami che lo riguardano.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64" />
        ) : !sets.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nessun recupero da preparare. Compare qui quando firmi una correzione che lascia obiettivi da riprendere.
            </CardContent>
          </Card>
        ) : (
          sets.map((s) => <SetCard key={`${s.id}-${s.status}-${s.intervalsDays.join("-")}`} set={s} />)
        )}
      </div>
    </TeacherLayout>
  );
}
