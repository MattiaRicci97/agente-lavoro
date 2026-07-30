import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListClasses } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Gavel,
  Sparkles,
  CheckCircle2,
  Loader2,
  Printer,
  Lock,
  X,
  TrendingUp,
  TrendingDown,
  BrainCircuit,
  Trash2,
} from "lucide-react";
import { gradeTone } from "@/lib/grades";

interface Summary {
  bySubject: Array<{ subject: string; average: number; count: number }>;
  overallAverage: number | null;
  gradesCount: number;
  trend: { first: number; last: number } | null;
  practice: { attempts: number; accuracyPercent: number | null };
}

interface Entry {
  id: number;
  studentId: number;
  studentName: string;
  summary: Summary;
  aiDraft: string;
  giudizio: string;
  status: "bozza" | "approvato";
  approvedAt: string | null;
  approvedBy: string | null;
  besDsa: boolean | null;
}

interface Scrutinio {
  id: number;
  classId: number;
  label: string;
  periodFrom: string | null;
  periodTo: string | null;
  status: "aperto" | "chiuso";
  closedAt: string | null;
}

interface Dossier {
  scrutinio: Scrutinio;
  class: { id: number; name: string; gradeLevel: string } | null;
  entries: Entry[];
  isCoordinator: boolean;
}

/** Scheda di un alunno: i numeri, la bozza, il giudizio del consiglio. */
function SchedaAlunno({
  entry,
  readOnly,
  onDraft,
  drafting,
  onSave,
  onApprove,
  onReopen,
  saving,
}: {
  entry: Entry;
  readOnly: boolean;
  onDraft: () => void;
  drafting: boolean;
  onSave: (text: string) => void;
  onApprove: (text: string) => void;
  onReopen: () => void;
  saving: boolean;
}) {
  const [text, setText] = useState(entry.giudizio);
  const s = entry.summary;
  const approved = entry.status === "approvato";
  const modificato = entry.aiDraft && text.trim() !== entry.aiDraft.trim();

  return (
    <Card className={approved ? "border-emerald-300/50" : undefined}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{entry.studentName}</span>
          {entry.besDsa && (
            <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
              BES/DSA
            </Badge>
          )}
          {approved ? (
            <Badge className="ml-auto gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              <CheckCircle2 className="h-3 w-3" />
              Approvato{entry.approvedBy ? ` · ${entry.approvedBy}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto text-[10px]">Da approvare</Badge>
          )}
        </div>

        {/* I numeri: sono i voti che i docenti hanno già firmato */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 p-3">
          {s.overallAverage !== null ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Media</div>
              <div className={`text-2xl font-semibold ${gradeTone(s.overallAverage)}`}>
                {s.overallAverage}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Nessuna valutazione firmata nel periodo</div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {s.bySubject.map((m) => (
              <span
                key={m.subject}
                className="rounded-md border bg-card px-2 py-1 text-xs"
                title={`${m.count} prove`}
              >
                {m.subject} <span className={`font-semibold ${gradeTone(m.average)}`}>{m.average}</span>
              </span>
            ))}
          </div>

          {s.trend && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {s.trend.last >= s.trend.first ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              )}
              {s.trend.first} → {s.trend.last}
            </span>
          )}

          {s.practice.attempts > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BrainCircuit className="h-3.5 w-3.5" />
              {s.practice.attempts} esercitazioni
              {s.practice.accuracyPercent !== null && ` · ${s.practice.accuracyPercent}%`}
            </span>
          )}
        </div>

        {readOnly ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.giudizio}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Giudizio del consiglio</Label>
              {modificato && (
                <Badge variant="outline" className="text-[10px]">modificato dal consiglio</Badge>
              )}
              {!entry.aiDraft && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={onDraft}
                  disabled={drafting}
                >
                  {drafting ? (
                    <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Preparo...</>
                  ) : (
                    <><Sparkles className="mr-1.5 h-3 w-3" /> Prepara bozza</>
                  )}
                </Button>
              )}
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Il giudizio che il consiglio approva…"
              className="min-h-[110px] resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              {approved ? (
                <Button variant="outline" size="sm" onClick={onReopen} disabled={saving}>
                  Riapri
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => onApprove(text)} disabled={saving || !text.trim()}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Approva
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSave(text)} disabled={saving}>
                    Salva senza approvare
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Il verbale da portare in riunione o allegare agli atti. */
function VerbaleStampabile({ dossier, onClose }: { dossier: Dossier; onClose: () => void }) {
  return createPortal(
    <div className="print-surface fixed inset-0 z-50 overflow-auto bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-start justify-between print:hidden">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Stampa o salva in PDF
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <h1 className="text-2xl font-bold">
          Scrutinio — {dossier.class?.name} ({dossier.class?.gradeLevel})
        </h1>
        <p className="mt-1 text-sm">
          {dossier.scrutinio.label}
          {dossier.scrutinio.periodFrom && ` · dal ${dossier.scrutinio.periodFrom}`}
          {dossier.scrutinio.periodTo && ` al ${dossier.scrutinio.periodTo}`}
        </p>
        <p className="mt-4 border-y py-2 text-xs">
          Giudizi deliberati dal consiglio di classe. Le medie riportate sono calcolate sulle sole
          valutazioni firmate dai docenti nel periodo indicato.
        </p>

        <div className="mt-6 space-y-5">
          {dossier.entries.map((e) => (
            <div key={e.id} className="break-inside-avoid border-b pb-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{e.studentName}</span>
                <span className="text-sm">
                  Media {e.summary.overallAverage ?? "—"} · {e.summary.gradesCount} valutazioni
                </span>
              </div>
              {e.summary.bySubject.length > 0 && (
                <div className="mt-1 text-xs">
                  {e.summary.bySubject.map((m) => `${m.subject} ${m.average}`).join(" · ")}
                </div>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{e.giudizio || "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CattedraScrutinio() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes } = useListClasses();

  const [classId, setClassId] = useState<number | null>(null);
  const activeClassId = classId ?? classes?.[0]?.id ?? null;
  const [openId, setOpenId] = useState<number | null>(null);
  const [label, setLabel] = useState("Primo quadrimestre");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [printing, setPrinting] = useState(false);
  const [draftingId, setDraftingId] = useState<number | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const listKey = ["scrutini", activeClassId];
  const { data: list } = useQuery({
    queryKey: listKey,
    enabled: !!activeClassId,
    queryFn: () => customFetch<Scrutinio[]>(`/api/classes/${activeClassId}/scrutini`, { responseType: "json" }),
  });

  const dossierKey = ["scrutinio", openId];
  const { data: dossier, isLoading: dossierLoading } = useQuery({
    queryKey: dossierKey,
    enabled: !!openId,
    queryFn: () => customFetch<Dossier>(`/api/scrutini/${openId}`, { responseType: "json" }),
  });

  const fail = (fallback: string) => (err: any) =>
    toast({ title: "Operazione non riuscita", description: err?.data?.error ?? fallback, variant: "destructive" });

  const prepara = useMutation({
    mutationFn: () =>
      customFetch<Scrutinio>("/api/scrutini", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          classId: activeClassId,
          label: label.trim(),
          periodFrom: from || null,
          periodTo: to || null,
        }),
      }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: listKey });
      setOpenId(s.id);
      toast({ title: "Scrutinio preparato", description: "Ogni alunno ha già la sua scheda." });
    },
    onError: fail("Impossibile preparare lo scrutinio."),
  });

  const draft = useMutation({
    mutationFn: (entryId: number) =>
      customFetch(`/api/scrutinio-entries/${entryId}/draft`, { method: "POST", responseType: "json" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: dossierKey }),
  });

  const save = useMutation({
    mutationFn: ({ entryId, body }: { entryId: number; body: Record<string, unknown> }) =>
      customFetch(`/api/scrutinio-entries/${entryId}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dossierKey }),
    onError: fail("Impossibile salvare il giudizio."),
  });

  const close = useMutation({
    mutationFn: () => customFetch(`/api/scrutini/${openId}/close`, { method: "POST", responseType: "json" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dossierKey });
      queryClient.invalidateQueries({ queryKey: listKey });
      toast({ title: "Scrutinio chiuso", description: "Da qui in poi è un documento." });
    },
    onError: fail("Impossibile chiudere lo scrutinio."),
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/scrutini/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setOpenId(null);
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: fail("Impossibile eliminare lo scrutinio."),
  });

  /** Prepara le bozze una per una: si vede la classe riempirsi. */
  const preparaTutte = async () => {
    const todo = (dossier?.entries ?? []).filter((e) => !e.aiDraft);
    if (!todo.length) return;
    setBulk({ done: 0, total: todo.length });
    for (const [i, e] of todo.entries()) {
      try {
        await draft.mutateAsync(e.id);
      } catch {
        // Un fallimento singolo non deve fermare la classe.
      }
      setBulk({ done: i + 1, total: todo.length });
    }
    setBulk(null);
    queryClient.invalidateQueries({ queryKey: dossierKey });
  };

  if (!classes?.length) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-4xl p-8">
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <Gavel className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nessuna classe</h3>
            <p className="text-muted-foreground">Lo scrutinio si prepara su una classe.</p>
          </div>
        </div>
      </TeacherLayout>
    );
  }

  const readOnly = dossier?.scrutinio.status === "chiuso";
  const daApprovare = (dossier?.entries ?? []).filter((e) => e.status === "bozza").length;

  return (
    <TeacherLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Scrutinio</h1>
          <p className="mt-1 text-muted-foreground">
            Il consiglio si apre già istruito: ogni alunno arriva con i voti firmati di tutte le materie
            e una bozza di giudizio da discutere.
          </p>
        </div>

        {!openId ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Prepara un nuovo scrutinio</CardTitle>
                <CardDescription>
                  Sillabo raccoglie le valutazioni firmate del periodo. I giudizi restano da deliberare.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Classe</Label>
                  <Select value={String(activeClassId ?? "")} onValueChange={(v) => setClassId(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} — {c.gradeLevel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Periodo</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dal (facoltativo)</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Al (facoltativo)</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="flex items-end sm:col-span-2">
                  <Button onClick={() => prepara.mutate()} disabled={prepara.isPending || !label.trim()}>
                    {prepara.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparo la classe...</>
                    ) : (
                      <><Gavel className="mr-2 h-4 w-4" /> Prepara lo scrutinio</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {(list ?? []).length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">Scrutini di questa classe</h2>
                <div className="divide-y rounded-lg border">
                  {(list ?? []).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.status === "chiuso" ? "Chiuso" : "Aperto"}
                          {s.periodFrom && ` · dal ${s.periodFrom}`}
                          {s.periodTo && ` al ${s.periodTo}`}
                        </div>
                      </div>
                      {s.status === "chiuso" && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Button variant="outline" size="sm" onClick={() => setOpenId(s.id)}>
                        Apri
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : dossierLoading || !dossier ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {dossier.class?.name} — {dossier.scrutinio.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dossier.entries.length} alunni ·{" "}
                  {readOnly ? "chiuso" : `${daApprovare} giudizi da approvare`}
                </div>
              </div>

              {!readOnly && (
                <Button variant="outline" size="sm" onClick={preparaTutte} disabled={!!bulk}>
                  {bulk ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {bulk.done}/{bulk.total}</>
                  ) : (
                    <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Prepara tutte le bozze</>
                  )}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setPrinting(true)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Verbale
              </Button>
              {!readOnly && dossier.isCoordinator && (
                <Button size="sm" onClick={() => close.mutate()} disabled={close.isPending}>
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  Chiudi
                </Button>
              )}
              {!readOnly && dossier.isCoordinator && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(dossier.scrutinio.id)}
                  aria-label="Elimina lo scrutinio"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                Indietro
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Sillabo prepara il giudizio descrittivo. L'ammissione alla classe successiva resta una
              decisione del consiglio e non viene proposta qui.
            </p>

            <div className="space-y-4">
              {dossier.entries.map((e) => (
                <SchedaAlunno
                  key={e.id}
                  entry={e}
                  readOnly={!!readOnly}
                  drafting={draftingId === e.id || !!bulk}
                  saving={save.isPending}
                  onDraft={async () => {
                    setDraftingId(e.id);
                    try {
                      await draft.mutateAsync(e.id);
                    } catch {
                      toast({ title: "Bozza non riuscita", variant: "destructive" });
                    }
                    setDraftingId(null);
                  }}
                  onSave={(text) => save.mutate({ entryId: e.id, body: { giudizio: text } })}
                  onApprove={(text) =>
                    save.mutate({ entryId: e.id, body: { giudizio: text, status: "approvato" } })
                  }
                  onReopen={() => save.mutate({ entryId: e.id, body: { status: "bozza" } })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {printing && dossier && <VerbaleStampabile dossier={dossier} onClose={() => setPrinting(false)} />}
    </TeacherLayout>
  );
}
