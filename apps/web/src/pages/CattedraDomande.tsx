import { useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetMaterial,
  getGetMaterialQueryKey,
  useListQuestions,
  getListQuestionsQueryKey,
  getListMaterialsQueryKey,
  customFetch,
} from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Trash2,
  Pencil,
  Plus,
  Sparkles,
  User,
  Loader2,
  X,
} from "lucide-react";

type Difficulty = "facile" | "medio" | "difficile";

interface QuestionRow {
  id: number;
  question: string;
  answer: string;
  topic: string;
  difficulty: Difficulty;
  status?: "bozza" | "approvata";
  authorType?: "ai" | "docente";
  editedByTeacher?: boolean;
}

const DIFFICULTIES: Difficulty[] = ["facile", "medio", "difficile"];

/** Riga di domanda: in lettura mostra i dati, in modifica un piccolo form. */
function QuestionCard({
  q,
  onSave,
  onApprove,
  onDelete,
  busy,
}: {
  q: QuestionRow;
  onSave: (patch: Partial<QuestionRow>) => void;
  onApprove: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(q.question);
  const [answer, setAnswer] = useState(q.answer);
  const [topic, setTopic] = useState(q.topic);
  const [difficulty, setDifficulty] = useState<Difficulty>(q.difficulty);

  const isDraft = q.status === "bozza";

  function save() {
    onSave({ question, answer, topic, difficulty });
    setEditing(false);
  }

  function cancel() {
    setQuestion(q.question);
    setAnswer(q.answer);
    setTopic(q.topic);
    setDifficulty(q.difficulty);
    setEditing(false);
  }

  return (
    <Card className={isDraft ? "border-amber-300/60" : ""}>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              Bozza
            </Badge>
          ) : (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">
              <Check className="mr-1 h-3 w-3" />
              Approvata
            </Badge>
          )}
          {q.authorType === "docente" ? (
            <Badge variant="secondary" className="gap-1">
              <User className="h-3 w-3" />
              Tua
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {q.editedByTeacher ? "AI, rivista da te" : "Prima stesura AI"}
            </Badge>
          )}
          <div className="ml-auto flex gap-1">
            {!editing && (
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)} title="Modifica">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={busy}
              title="Elimina"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Domanda</Label>
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-[70px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Risposta attesa</Label>
              <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-[90px]" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Argomento</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>
              <div className="w-40 space-y-1.5">
                <Label className="text-xs">Difficoltà</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={cancel}>
                <X className="mr-2 h-4 w-4" />
                Annulla
              </Button>
              <Button onClick={save} disabled={busy}>
                <Check className="mr-2 h-4 w-4" />
                Salva
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-medium leading-relaxed">{q.question}</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{q.answer}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="secondary" className="text-[10px]">{q.topic}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{q.difficulty}</Badge>
              {isDraft && (
                <Button size="sm" className="ml-auto" onClick={onApprove} disabled={busy}>
                  <Check className="mr-2 h-4 w-4" />
                  Approva
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function CattedraDomande() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState({ question: "", answer: "", topic: "", difficulty: "medio" as Difficulty });

  const { data: material } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });
  const { data: questions, isLoading } = useListQuestions(materialId, {
    query: { enabled: !!materialId, queryKey: getListQuestionsQueryKey(materialId) },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey(materialId) });
    queryClient.invalidateQueries({ queryKey: getGetMaterialQueryKey(materialId) });
    queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
  }

  const onError = (err: any) =>
    toast({
      title: "Errore",
      description: err?.data?.error ?? "Operazione non riuscita.",
      variant: "destructive",
    });

  const edit = useMutation({
    mutationFn: ({ qid, patch }: { qid: number; patch: Partial<QuestionRow> }) =>
      customFetch(`/api/questions/${qid}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(patch),
      }),
    onSuccess: refresh,
    onError,
  });

  const approve = useMutation({
    mutationFn: (qid: number) =>
      customFetch(`/api/questions/${qid}/approve`, { method: "POST", responseType: "json" }),
    onSuccess: refresh,
    onError,
  });

  const approveAll = useMutation({
    mutationFn: () =>
      customFetch<{ approved: number }>(`/api/materials/${materialId}/questions/approve-all`, {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: (data) => {
      toast({
        title: "Domande approvate",
        description: `${data.approved} domande sono ora disponibili per gli studenti.`,
      });
      refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (qid: number) => customFetch(`/api/questions/${qid}`, { method: "DELETE", responseType: "text" }),
    onSuccess: refresh,
    onError,
  });

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/materials/${materialId}/questions`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(newQ),
      }),
    onSuccess: () => {
      toast({ title: "Domanda aggiunta", description: "È già disponibile per i tuoi studenti." });
      setNewQ({ question: "", answer: "", topic: "", difficulty: "medio" });
      setAdding(false);
      refresh();
    },
    onError,
  });

  const busy = edit.isPending || approve.isPending || remove.isPending || approveAll.isPending;
  const list = (questions ?? []) as QuestionRow[];
  const drafts = list.filter((q) => q.status === "bozza");

  return (
    <TeacherLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <Button variant="ghost" asChild className="-ml-4 mb-2">
            <Link href={`/cattedra/material/${materialId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna al materiale
            </Link>
          </Button>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Le tue domande</h1>
          <p className="text-muted-foreground mt-1">
            {material?.title}
            {" — "}
            L'assistente scrive la prima stesura, ma decidi tu: riscrivi, elimina, aggiungi le tue.
            Agli studenti arrivano solo le domande approvate.
          </p>
        </div>

        {drafts.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4">
            <div>
              <h3 className="font-medium text-amber-900">
                {drafts.length} {drafts.length === 1 ? "bozza in attesa" : "bozze in attesa"}
              </h3>
              <p className="text-sm text-amber-800">
                Non sono ancora visibili agli studenti. Rivedile una a una, oppure approvale tutte.
              </p>
            </div>
            <Button onClick={() => approveAll.mutate()} disabled={busy} className="shrink-0">
              {approveAll.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Approva tutte
            </Button>
          </div>
        )}

        {adding ? (
          <Card className="border-primary/30">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-medium">Scrivi una domanda tua</h3>
              <div className="space-y-1.5">
                <Label className="text-xs">Domanda</Label>
                <Textarea
                  value={newQ.question}
                  onChange={(e) => setNewQ({ ...newQ, question: e.target.value })}
                  className="min-h-[70px]"
                  placeholder="es. Spiega perché la fotosintesi avviene solo in presenza di luce."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Risposta attesa</Label>
                <Textarea
                  value={newQ.answer}
                  onChange={(e) => setNewQ({ ...newQ, answer: e.target.value })}
                  className="min-h-[90px]"
                  placeholder="Cosa ti aspetti che lo studente sappia dire."
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Argomento</Label>
                  <Input
                    value={newQ.topic}
                    onChange={(e) => setNewQ({ ...newQ, topic: e.target.value })}
                    placeholder="es. Fotosintesi"
                  />
                </div>
                <div className="w-40 space-y-1.5">
                  <Label className="text-xs">Difficoltà</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={newQ.difficulty}
                    onChange={(e) => setNewQ({ ...newQ, difficulty: e.target.value as Difficulty })}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Annulla
                </Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !newQ.question.trim() || !newQ.answer.trim() || !newQ.topic.trim()}
                >
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Aggiungi
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Scrivi una domanda tua
          </Button>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <h3 className="text-lg font-medium">Nessuna domanda</h3>
            <p className="text-muted-foreground">
              Genera una prima stesura dal materiale, oppure scrivi tu la prima domanda.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                busy={busy}
                onSave={(patch) => edit.mutate({ qid: q.id, patch })}
                onApprove={() => approve.mutate(q.id)}
                onDelete={() => remove.mutate(q.id)}
              />
            ))}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
