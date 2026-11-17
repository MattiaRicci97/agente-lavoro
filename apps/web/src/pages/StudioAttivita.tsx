import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Compass, Send, Loader2, CheckCircle2, PartyPopper } from "lucide-react";

export interface GuidedActivityItem {
  id: number;
  classId: number;
  subject: string;
  title: string;
  brief: string;
  dueDate: string | null;
  status: "da_fare" | "iniziata" | "completata";
  objectives: string[];
}

type Message = { role: "user" | "assistant"; content: string; passages?: Array<{ n: number; label: string }> };

/**
 * Lo svolgimento di un'attivita' guidata: una chat in cui l'assistente guida
 * con domande, dentro i materiali scelti dal docente. La conversazione vive
 * solo in questa pagina.
 */
export default function StudioAttivita() {
  const { id } = useParams();
  const activityId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["myGuidedActivities"],
    queryFn: () => customFetch<{ activities: GuidedActivityItem[] }>("/api/me/guided-activities", { responseType: "json" }),
  });
  const activity = data?.activities.find((a) => a.id === activityId) ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onError = (err: any) =>
    toast({ title: "Non ci sono riuscito", description: err?.data?.error ?? "Riprova tra poco.", variant: "destructive" });
  const history = () => messages.map((m) => ({ role: m.role, content: m.content }));

  const chat = useMutation({
    mutationFn: (q: string) =>
      customFetch<{ answer: string; passages: Array<{ n: number; label: string }> }>(`/api/guided-activities/${activityId}/chat`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ question: q, history: history().slice(-12) }),
      }),
    onSuccess: (res) => setMessages((cur) => [...cur, { role: "assistant", content: res.answer, passages: res.passages }]),
    onError,
  });

  const complete = useMutation({
    mutationFn: () =>
      customFetch(`/api/guided-activities/${activityId}/complete`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ history: history().slice(-30) }),
      }),
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ["myGuidedActivities"] });
    },
    onError,
  });

  function send(text?: string) {
    const q = (text ?? question).trim();
    if (!q || chat.isPending) return;
    setMessages((cur) => [...cur, { role: "user", content: q }]);
    setQuestion("");
    chat.mutate(q);
  }

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto"><Skeleton className="h-96" /></div>
      </StudentLayout>
    );
  }

  if (!activity) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16 text-center p-12 border rounded-lg bg-card border-dashed">
          <h3 className="text-lg font-medium">Attività non trovata</h3>
          <p className="text-muted-foreground">Forse il docente l'ha ritirata.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/studio/corso">Torna al corso</Link>
          </Button>
        </div>
      </StudentLayout>
    );
  }

  if (done) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16">
          <Card className="border-secondary/30 bg-secondary/5">
            <CardContent className="p-10 text-center space-y-4">
              <PartyPopper className="mx-auto h-12 w-12 text-secondary" />
              <h2 className="text-2xl font-bold text-secondary">Attività completata</h2>
              <p className="text-muted-foreground">
                Il tuo docente saprà che la classe ci ha lavorato e su quali punti serve tornare. Non è una verifica: non c'è
                nessun voto.
              </p>
              <Button asChild>
                <Link href="/studio/corso">Torna al corso</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  const userTurns = messages.filter((m) => m.role === "user").length;
  const busy = chat.isPending || complete.isPending;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" asChild className="-ml-4">
          <Link href="/studio/corso">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna al corso
          </Link>
        </Button>

        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
              <Compass className="h-4 w-4" /> Attività guidata dal tuo docente · {activity.subject}
              {activity.status === "completata" && (
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> già completata
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{activity.title}</h1>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{activity.brief}</p>
            {activity.dueDate && (
              <p className="text-xs text-muted-foreground">
                Entro il {new Date(`${activity.dueDate}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 min-h-[200px]">
          {messages.length === 0 && (
            <Card>
              <CardContent className="p-6 space-y-3 text-sm text-muted-foreground">
                <p>
                  L'assistente ti guida con domande, usando solo i materiali scelti dal docente. Non ti dà la soluzione pronta:
                  ci arrivi tu, un passo alla volta. Non è una verifica e non c'è voto.
                </p>
                <Button onClick={() => send("Sono pronto: da dove cominciamo?")} disabled={busy}>
                  Cominciamo
                </Button>
              </CardContent>
            </Card>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-secondary-foreground whitespace-pre-wrap">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="max-w-[92%] space-y-2">
                <div className="rounded-2xl rounded-bl-sm border bg-card px-4 py-3 whitespace-pre-wrap leading-relaxed">{m.content}</div>
                {(m.passages?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    <span className="text-xs text-muted-foreground">Dal materiale:</span>
                    {Array.from(new Map(m.passages!.map((p) => [p.label, p])).values()).map((p) => (
                      <Badge key={p.label} variant="outline" className="font-normal">
                        {p.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {chat.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Ci penso…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {userTurns >= 2 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
            <span className="text-sm text-muted-foreground">Quando senti di aver capito, chiudi l'attività.</span>
            <Button variant="outline" className="bg-card" onClick={() => complete.mutate()} disabled={busy}>
              {complete.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Ho finito
            </Button>
          </div>
        )}

        <div className="sticky bottom-20 z-10 flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm sm:bottom-4">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Scrivi qui…"
            className="min-h-[44px] resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <Button size="icon" onClick={() => send()} disabled={busy || !question.trim()} title="Invia">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </StudentLayout>
  );
}
