import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ClipboardList, Clock, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface TakeItem {
  id: number;
  question: string;
  options: string[];
  area: string;
  chosen?: number | null;
  correctIndex?: number;
  explanation?: string;
}

interface Take {
  id: number;
  subject: string;
  title: string;
  passage: string | null;
  minutes: number;
  done: boolean;
  score?: number;
  total?: number;
  items: TakeItem[];
}

const LETTERS = ["A", "B", "C", "D"];

/** Minuti e secondi trascorsi dall'inizio: un riferimento, non un limite. */
function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

export default function StudioProva() {
  const { id } = useParams();
  const testId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["invalsiTake", testId];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    enabled: !!testId,
    retry: false,
    queryFn: () => customFetch<Take>(`/api/invalsi-tests/${testId}/take`, { responseType: "json" }),
  });
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const elapsed = useElapsed(started && !!data && !data.done);

  const submit = useMutation({
    mutationFn: () =>
      customFetch<Take>(`/api/invalsi-tests/${testId}/submit`, { method: "POST", responseType: "json", body: JSON.stringify({ answers }) }),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      void queryClient.invalidateQueries({ queryKey: ["myAgenda"] });
      void queryClient.invalidateQueries({ queryKey: ["myInvalsiTests"] });
      window.scrollTo({ top: 0 });
    },
    onError: (err: any) =>
      toast({ title: "Consegna non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" }),
  });

  const back = (
    <Button variant="ghost" asChild className="-ml-4">
      <Link href="/studio">
        <ArrowLeft className="mr-2 h-4 w-4" /> Torna alla home
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto"><Skeleton className="h-96" /></div>
      </StudentLayout>
    );
  }
  if (isError || !data) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16 text-center p-12 border rounded-lg bg-card border-dashed">
          <h3 className="text-lg font-medium">Prova non trovata</h3>
          <p className="text-muted-foreground">Forse il docente l'ha ritirata.</p>
          <div className="mt-4">{back}</div>
        </div>
      </StudentLayout>
    );
  }

  const header = (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-secondary">
        <ClipboardList className="h-4 w-4" /> Allenamento INVALSI · {data.subject}
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{data.title}</h1>
    </div>
  );

  if (!data.done && !started) {
    return (
      <StudentLayout>
        <div className="max-w-2xl mx-auto space-y-4">
          {back}
          {header}
          <Card>
            <CardContent className="p-6 space-y-3 text-sm">
              <p>
                {data.items.length} quesiti a risposta chiusa{data.passage ? ", con un testo da leggere" : ""}. Tempo consigliato:
                circa {data.minutes} minuti.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Una sola risposta giusta per quesito; se non sai, puoi lasciare in bianco.</li>
                <li>Si consegna una volta sola. Subito dopo vedi le risposte corrette e le spiegazioni.</li>
                <li>È un allenamento: non c'è voto e non entra nel registro.</li>
              </ul>
              <Button onClick={() => setStarted(true)}>Comincia</Button>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  const answered = Object.keys(answers).length;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-4 pb-24">
        {back}
        {header}

        {data.done ? (
          <Card className="border-secondary/20 bg-secondary/5">
            <CardContent className="p-6 text-center">
              <div className="text-5xl font-bold text-secondary tabular-nums">
                {data.score}/{data.total}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                risposte corrette. È un allenamento, non un voto: guarda sotto dove hai sbagliato e perché.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="sticky top-16 z-10 flex items-center justify-between rounded-xl border bg-card px-4 py-2 text-sm shadow-sm">
            <span>
              {answered} di {data.items.length} risposte
            </span>
            <span className={`flex items-center gap-1 tabular-nums ${elapsed > data.minutes * 60 ? "text-amber-700" : "text-muted-foreground"}`}>
              <Clock className="h-4 w-4" />
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / {data.minutes}:00
            </span>
          </div>
        )}

        {data.passage && (
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Testo da leggere</div>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{data.passage}</p>
            </CardContent>
          </Card>
        )}

        <ol className="space-y-4">
          {data.items.map((item, n) => {
            const chosen = data.done ? (item.chosen ?? null) : (answers[item.id] ?? null);
            const outcome = !data.done ? null : chosen === null ? "blank" : chosen === item.correctIndex ? "ok" : "wrong";
            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap font-medium leading-relaxed">
                        {n + 1}. {item.question}
                      </p>
                      {outcome === "ok" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Corretta" />}
                      {outcome === "wrong" && <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-label="Sbagliata" />}
                      {outcome === "blank" && <MinusCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="In bianco" />}
                    </div>
                    <div className="space-y-2" role="radiogroup" aria-label={`Quesito ${n + 1}`}>
                      {item.options.map((o, i) => {
                        const isChosen = chosen === i;
                        const isCorrect = data.done && item.correctIndex === i;
                        const tone = data.done
                          ? isCorrect
                            ? "border-emerald-400 bg-emerald-50"
                            : isChosen
                              ? "border-rose-300 bg-rose-50"
                              : ""
                          : isChosen
                            ? "border-secondary bg-secondary/10"
                            : "hover:bg-muted/40";
                        return (
                          <button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={isChosen}
                            disabled={data.done}
                            onClick={() =>
                              setAnswers((cur) => {
                                // Un secondo tocco sulla stessa alternativa la toglie: si puo' tornare in bianco.
                                if (cur[item.id] === i) {
                                  const { [item.id]: _removed, ...rest } = cur;
                                  return rest;
                                }
                                return { ...cur, [item.id]: i };
                              })
                            }
                            className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${tone}`}
                          >
                            <span className="font-medium">{LETTERS[i]}</span>
                            <span className="min-w-0 flex-1">{o}</span>
                            {data.done && isChosen && !isCorrect && <Badge variant="outline" className="shrink-0 text-[10px]">la tua</Badge>}
                            {isCorrect && <Badge variant="outline" className="shrink-0 border-emerald-300 text-[10px] text-emerald-800">corretta</Badge>}
                          </button>
                        );
                      })}
                    </div>
                    {data.done && item.explanation && (
                      <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{item.explanation}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>

        {!data.done && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
            <span className="text-sm text-muted-foreground">
              {answered < data.items.length
                ? `Hai lasciato ${data.items.length - answered} ${data.items.length - answered === 1 ? "quesito" : "quesiti"} in bianco.`
                : "Hai risposto a tutto."}{" "}
              Dopo la consegna non si cambia.
            </span>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Consegna
            </Button>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
