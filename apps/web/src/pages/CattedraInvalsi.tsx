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
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Sparkles, Loader2, Trash2, Pencil, Plus, Send, Users, ShieldCheck, Check } from "lucide-react";

interface Item {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  area: string;
  authorType: "ai" | "docente";
}

interface Results {
  classSize: number;
  completed: number;
  averagePercent: number | null;
  items: Array<{ id: number; correct: number; answered: number; blank: number; topWrongIndex: number | null }>;
  students: Array<{ name: string; score: number; total: number }>;
}

interface Test {
  id: number;
  subject: string;
  gradeLevel: string;
  title: string;
  passage: string | null;
  minutes: number;
  status: "bozza" | "pubblicata";
  items: Item[];
  results: Results | null;
}

type ItemBody = Omit<Item, "id" | "authorType">;
const LETTERS = ["A", "B", "C", "D"];
const EMPTY: ItemBody = { question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "", area: "" };

function ItemForm({ initial, busy, onSave, onCancel }: { initial: ItemBody; busy: boolean; onSave: (body: ItemBody) => Promise<unknown>; onCancel: () => void }) {
  const [v, setV] = useState<ItemBody>(initial);
  const valid = v.question.trim().length >= 5 && v.options.every((o) => o.trim()) && new Set(v.options.map((o) => o.trim().toLowerCase())).size === 4;
  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <Textarea value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} rows={2} placeholder="Domanda" />
      {v.options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name="correct"
            aria-label={`La risposta corretta è ${LETTERS[i]}`}
            checked={v.correctIndex === i}
            onChange={() => setV({ ...v, correctIndex: i })}
          />
          <span className="w-4 text-xs font-medium">{LETTERS[i]}</span>
          <Input value={o} onChange={(e) => setV({ ...v, options: v.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Alternativa ${LETTERS[i]}`} />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Il pallino indica la risposta corretta. Le quattro alternative devono essere diverse.</p>
      <Input value={v.explanation} onChange={(e) => setV({ ...v, explanation: e.target.value })} placeholder="Spiegazione: perché è quella giusta" />
      <Input value={v.area} onChange={(e) => setV({ ...v, area: e.target.value })} placeholder="Ambito (es. Numeri, Comprensione del testo)" />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !valid}
          onClick={() => onSave({ ...v, question: v.question.trim(), options: v.options.map((o) => o.trim()), explanation: v.explanation.trim(), area: v.area.trim() })}
        >
          Salva
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

function TestCard({ test, onChanged }: { test: Test; onChanged: () => void }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [showPassage, setShowPassage] = useState(false);
  const [passage, setPassage] = useState(test.passage ?? "");
  const draft = test.status === "bozza";

  const call = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      customFetch(path, { method, ...(method === "DELETE" ? {} : { responseType: "json" as const }), ...(body ? { body: JSON.stringify(body) } : {}) }),
    onSuccess: onChanged,
    onError: (err: any) =>
      toast({ title: "Operazione non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" }),
  });
  const busy = call.isPending;
  const stats = new Map((test.results?.items ?? []).map((s) => [s.id, s]));
  const completed = test.results?.completed ?? 0;

  return (
    <Card className={draft ? "border-amber-300/60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg">{test.title}</CardTitle>
            <CardDescription className="mt-1">
              {test.subject} · {test.gradeLevel} · {test.items.length} quesiti · circa {test.minutes} min
            </CardDescription>
          </div>
          {draft ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Bozza, non visibile agli studenti</Badge>
          ) : (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">Pubblicata</Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            title={draft ? "Elimina la bozza" : "Ritira la prova"}
            disabled={busy}
            onClick={() => call.mutate({ path: `/api/invalsi-tests/${test.id}`, method: "DELETE" })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {test.results && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>{completed}</strong> su {test.results.classSize} l'hanno svolta
                {test.results.averagePercent !== null && ` · media ${test.results.averagePercent}% di risposte corrette`}
              </span>
            </div>
            {test.results.students.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {test.results.students.map((s) => (
                  <Badge key={s.name} variant="outline" className="font-normal tabular-nums">
                    {s.name}: {s.score}/{s.total}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">È allenamento: questi punteggi non sono voti e non entrano nel registro.</p>
          </div>
        )}

        {(test.passage || draft) && test.subject !== "Matematica" && (
          <div className="space-y-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowPassage(!showPassage)}>
              {showPassage ? "Nascondi il testo da leggere" : "Mostra il testo da leggere"}
            </Button>
            {showPassage &&
              (draft ? (
                <div className="space-y-2">
                  <Textarea value={passage} onChange={(e) => setPassage(e.target.value)} className="min-h-[220px] text-sm leading-relaxed" />
                  <Button
                    size="sm"
                    disabled={busy || passage.trim() === (test.passage ?? "")}
                    onClick={() => call.mutate({ path: `/api/invalsi-tests/${test.id}`, method: "PATCH", body: { passage: passage.trim() || null } })}
                  >
                    Salva il testo
                  </Button>
                </div>
              ) : (
                <p className="whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm leading-relaxed">{test.passage}</p>
              ))}
          </div>
        )}

        <ol className="space-y-3">
          {test.items.map((item, n) => {
            const s = stats.get(item.id);
            return (
              <li key={item.id} className="rounded-lg border bg-card p-3 text-sm">
                {editingId === item.id ? (
                  <ItemForm
                    initial={item}
                    busy={busy}
                    onCancel={() => setEditingId(null)}
                    onSave={async (body) => {
                      await call.mutateAsync({ path: `/api/invalsi-items/${item.id}`, method: "PATCH", body });
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap font-medium">
                          {n + 1}. {item.question}
                        </p>
                        {item.area && <span className="text-xs text-muted-foreground">{item.area}</span>}
                      </div>
                      {draft && (
                        <div className="flex shrink-0">
                          <Button size="icon" variant="ghost" title="Modifica il quesito" onClick={() => setEditingId(item.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Elimina il quesito"
                            className="text-destructive"
                            disabled={busy}
                            onClick={() => call.mutate({ path: `/api/invalsi-items/${item.id}`, method: "DELETE" })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {item.options.map((o, i) => (
                        <li key={i} className={`flex items-start gap-2 ${i === item.correctIndex ? "font-medium text-emerald-700" : ""}`}>
                          <span className="w-4 shrink-0">{LETTERS[i]}</span>
                          <span className="min-w-0 flex-1">{o}</span>
                          {i === item.correctIndex && <Check className="h-4 w-4 shrink-0" />}
                          {s && completed > 0 && s.topWrongIndex === i && (
                            <Badge variant="outline" className="shrink-0 text-[10px] font-normal">l'errore più scelto</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                    {item.explanation && <p className="mt-2 text-xs text-muted-foreground">{item.explanation}</p>}
                    {s && completed > 0 && (
                      <p className="mt-2 text-xs tabular-nums">
                        Corrette: {s.correct} su {completed}
                        {s.blank > 0 && ` · in bianco: ${s.blank}`}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>

        {draft &&
          (editingId === "new" ? (
            <ItemForm
              initial={EMPTY}
              busy={busy}
              onCancel={() => setEditingId(null)}
              onSave={async (body) => {
                await call.mutateAsync({ path: `/api/invalsi-tests/${test.id}/items`, method: "POST", body });
                setEditingId(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button size="sm" variant="ghost" onClick={() => setEditingId("new")}>
                <Plus className="mr-1 h-4 w-4" /> Aggiungi un quesito tuo
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Rileggi i quesiti e le risposte: dopo la pubblicazione non si modificano.</span>
                <Button
                  disabled={busy || test.items.length < 5}
                  onClick={() =>
                    call.mutate(
                      { path: `/api/invalsi-tests/${test.id}/publish`, method: "POST" },
                      { onSuccess: () => toast({ title: "Prova pubblicata", description: "La classe la trova nella home e in bacheca." }) },
                    )
                  }
                >
                  <Send className="mr-2 h-4 w-4" /> Pubblica
                </Button>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

export default function CattedraInvalsi() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const [classId, setClassId] = useState<number | null>(null);
  useEffect(() => {
    if (classId === null && classes?.length) setClassId(classes[0].id);
  }, [classes, classId]);

  const [subject, setSubject] = useState("Matematica");
  const [gradeLevel, setGradeLevel] = useState("2ª Superiore");
  const [count, setCount] = useState("10");
  const [focus, setFocus] = useState("");

  const key = ["invalsiTests", classId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: classId !== null,
    queryFn: () => customFetch<{ classGradeLevel: string; tests: Test[] }>(`/api/classes/${classId}/invalsi-tests`, { responseType: "json" }),
  });
  // Le classi quarte e quinte si allenano sulla prova di quinta.
  useEffect(() => {
    if (data?.classGradeLevel) setGradeLevel(/^[45]/.test(data.classGradeLevel) ? "5ª Superiore" : "2ª Superiore");
  }, [data?.classGradeLevel]);

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/classes/${classId}/invalsi-tests`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ subject, gradeLevel, count: Number(count), focus: focus.trim() || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "Bozza pronta", description: "Rileggi i quesiti uno a uno, poi pubblica." });
      setFocus("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) =>
      toast({ title: "Operazione non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" }),
  });

  return (
    <TeacherLayout>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-primary flex items-center gap-2">
              <ClipboardList className="h-7 w-7" /> Allenamento INVALSI
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Prove a risposta chiusa nello stile delle rilevazioni nazionali, corrette in automatico. L'assistente propone i
              quesiti, tu li rileggi e pubblichi.
            </p>
          </div>
          {classes && classes.length > 0 && (
            <Select value={classId !== null ? String(classId) : undefined} onValueChange={(v) => setClassId(Number(v))}>
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
            Non sono le prove ufficiali INVALSI: sono quesiti nuovi, scritti per allenarsi su quel formato. Il punteggio non è un
            voto e non entra nel registro. Per inglese c'è solo la lettura, non l'ascolto.
          </span>
        </div>

        {classesLoading ? (
          <Skeleton className="h-40" />
        ) : !classes?.length ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed text-muted-foreground">Crea prima una classe.</div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prepara una nuova prova</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Materia</Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Matematica", "Italiano", "Inglese"].map((s) => (
                        <SelectItem key={s} value={s}>{s === "Inglese" ? "Inglese (lettura)" : s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Livello</Label>
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2ª Superiore">Seconda superiore</SelectItem>
                      <SelectItem value="5ª Superiore">Quinta superiore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quesiti</Label>
                  <Select value={count} onValueChange={setCount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["5", "10", "15", "20"].map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="invalsi-focus">Su cosa concentrarsi (facoltativo)</Label>
                <Input id="invalsi-focus" value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)} placeholder="es. funzioni e grafici, testo argomentativo" />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => create.mutate()} disabled={create.isPending || classId === null}>
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Proponi la prova
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? <Skeleton className="h-40" /> : (data?.tests ?? []).map((t) => (
          <TestCard key={`${t.id}-${t.status}`} test={t} onChanged={() => queryClient.invalidateQueries({ queryKey: key })} />
        ))}
      </div>
    </TeacherLayout>
  );
}
