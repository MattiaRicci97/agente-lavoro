import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessagesSquare, Send, Loader2, FileText, Mic, ListChecks, GraduationCap, Clock } from "lucide-react";

interface Course {
  classId: number;
  className: string;
  subject: string;
  documents: number;
  lessons: number;
}

interface Source {
  materialId: number;
  label: string;
  kind: string;
}

interface Plan {
  title: string;
  summary: string;
  steps: Array<{ title: string; activity: string; minutes: number; sources: Array<{ materialId: number; title: string }> }>;
}

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: Source[] }
  | { role: "plan"; topic: string; plan: Plan };

const courseKey = (c: Course) => `${c.classId}|${c.subject}`;

function PlanCard({ topic, plan }: { topic: string; plan: Plan }) {
  const total = plan.steps.reduce((a, s) => a + s.minutes, 0);
  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="font-medium">{plan.title}</span>
          <Badge variant="outline" className="font-normal">
            <Clock className="mr-1 h-3 w-3" /> circa {total} min
          </Badge>
        </div>
        {plan.summary && <p className="text-sm text-muted-foreground">{plan.summary}</p>}
        <ol className="space-y-2">
          {plan.steps.map((s, i) => (
            <li key={i} className="rounded-lg border bg-card p-3 text-sm">
              <div className="font-medium">
                {i + 1}. {s.title} <span className="font-normal text-muted-foreground">· {s.minutes} min</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{s.activity}</p>
              {s.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.sources.map((src) => (
                    <Badge key={src.materialId} variant="outline" className="font-normal">
                      {src.title}
                    </Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">Piano su "{topic}", costruito sul materiale del tuo corso. Lo ritrovi qui quando torni.</p>
      </CardContent>
    </Card>
  );
}

export default function StudioCorso() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const endRef = useRef<HTMLDivElement>(null);

  const { data: coursesData, isLoading } = useQuery({
    queryKey: ["myCourses"],
    queryFn: () => customFetch<{ courses: Course[] }>("/api/courses/mine", { responseType: "json" }),
  });
  const courses = coursesData?.courses ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const course = courses.find((c) => courseKey(c) === selected) ?? courses[0] ?? null;

  // I piani gia' preparati restano disponibili quando lo studente torna.
  const { data: savedData, refetch: refetchPlans } = useQuery({
    queryKey: ["myReviewPlans"],
    queryFn: () =>
      customFetch<{ plans: Array<{ id: number; classId: number; subject: string; topic: string; plan: Plan }> }>(
        "/api/courses/review-plans",
        { responseType: "json" },
      ),
  });
  const savedPlans = (savedData?.plans ?? []).filter(
    (p) => course && p.classId === course.classId && p.subject.toLowerCase() === course.subject.toLowerCase(),
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState("");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onError = (err: any) =>
    toast({ title: "Non ci sono riuscito", description: err?.data?.error ?? "Riprova tra poco.", variant: "destructive" });
  const post = <T,>(path: string, body: unknown) =>
    customFetch<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      responseType: "json",
    });

  const chat = useMutation({
    mutationFn: (q: string) =>
      post<{ answer: string; sources: Source[] }>("/api/courses/chat", {
        classId: course!.classId,
        subject: course!.subject,
        question: q,
        history: messages
          .filter((m): m is Extract<Message, { role: "user" | "assistant" }> => m.role !== "plan")
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    onSuccess: (data) => setMessages((cur) => [...cur, { role: "assistant", content: data.answer, sources: data.sources }]),
    onError,
  });

  const plan = useMutation({
    mutationFn: (t: string) =>
      post<{ topic: string; plan: Plan }>("/api/courses/review-plan", { classId: course!.classId, subject: course!.subject, topic: t }),
    onSuccess: (data) => {
      setMessages((cur) => [...cur, { role: "plan", topic: data.topic, plan: data.plan }]);
      void refetchPlans();
    },
    onError,
  });

  const oral = useMutation({
    mutationFn: (t: string) =>
      post<{ materialId: number; topic: string }>("/api/courses/oral-target", { classId: course!.classId, subject: course!.subject, topic: t }),
    onSuccess: (data) => setLocation(`/studio/material/${data.materialId}/orale?argomento=${encodeURIComponent(data.topic)}`),
    onError,
  });

  function send() {
    const q = question.trim();
    if (!q || !course || chat.isPending) return;
    setMessages((cur) => [...cur, { role: "user", content: q }]);
    // L'ultima domanda e' il punto di partenza naturale per piano e interrogazione.
    setTopic(q.length <= 80 ? q : q.slice(0, 80));
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

  if (!course) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16 text-center p-12 border rounded-lg bg-card border-dashed">
          <MessagesSquare className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Ancora nessun materiale</h3>
          <p className="text-muted-foreground">Quando i tuoi docenti condividono documenti e lezioni, qui potrai fare domande su tutto il corso.</p>
        </div>
      </StudentLayout>
    );
  }

  const busy = chat.isPending || plan.isPending || oral.isPending;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-secondary">Chiedi al corso</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Risponde solo da quello che il tuo docente ha condiviso: {course.documents} {course.documents === 1 ? "documento" : "documenti"}
              {course.lessons > 0 && ` e ${course.lessons} ${course.lessons === 1 ? "lezione" : "lezioni"}`}.
            </p>
          </div>
          {courses.length > 1 && (
            <Select
              value={courseKey(course)}
              onValueChange={(v) => {
                setSelected(v);
                setMessages([]);
                setTopic("");
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={courseKey(c)} value={courseKey(c)}>
                    {c.subject} — {c.className}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-3 min-h-[240px]">
          {messages.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground space-y-2">
                <p>Scrivi l'argomento di {course.subject} che vuoi ripassare, anche con parole tue. Per esempio:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>"Non ho capito quando si inverte il verso nelle disequazioni"</li>
                  <li>"Cosa ha detto il prof nell'ultima lezione?"</li>
                </ul>
                <p>Poi posso prepararti un piano di ripasso o interrogarti sull'argomento.</p>
              </CardContent>
            </Card>
          )}

          {messages.length === 0 && savedPlans.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">I tuoi piani di ripasso</div>
              {savedPlans.slice(0, 3).map((p) => (
                <PlanCard key={p.id} topic={p.topic} plan={p.plan} />
              ))}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "plan" ? (
              <PlanCard key={i} topic={m.topic} plan={m.plan} />
            ) : m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-secondary-foreground whitespace-pre-wrap">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="max-w-[92%] space-y-2">
                <div className="rounded-2xl rounded-bl-sm border bg-card px-4 py-3 whitespace-pre-wrap leading-relaxed">{m.content}</div>
                {m.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    <span className="text-xs text-muted-foreground">Dal corso:</span>
                    {m.sources.map((s, n) => (
                      <Badge key={s.materialId} variant="outline" className="font-normal">
                        {s.kind === "lezione" ? <Mic className="mr-1 h-3 w-3" /> : <FileText className="mr-1 h-3 w-3" />}
                        [{n + 1}] {s.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {chat.isPending ? "Cerco nel materiale del corso…" : plan.isPending ? "Preparo il piano…" : "Preparo l'interrogazione…"}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {messages.some((m) => m.role === "assistant") && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-52 space-y-1.5">
                <label className="text-xs font-medium">Argomento</label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} className="bg-card" />
              </div>
              <Button variant="outline" className="bg-card" disabled={busy || topic.trim().length < 2} onClick={() => plan.mutate(topic.trim())}>
                <ListChecks className="mr-2 h-4 w-4" /> Preparami un piano di ripasso
              </Button>
              <Button disabled={busy || topic.trim().length < 2} onClick={() => oral.mutate(topic.trim())}>
                <GraduationCap className="mr-2 h-4 w-4" /> Interrogami
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="sticky bottom-4 flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm">
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
            placeholder={`Cosa vuoi ripassare di ${course.subject}?`}
            className="min-h-[44px] resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <Button size="icon" onClick={send} disabled={busy || !question.trim()} title="Invia">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </StudentLayout>
  );
}
