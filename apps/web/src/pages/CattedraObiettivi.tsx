import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListInstitutions } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Target, CheckCircle2, Loader2, Pencil, Plus, Trash2, X, Link2 } from "lucide-react";

export interface Objective {
  id: number;
  code: string;
  subject: string;
  gradeLevel: string;
  title: string;
  description: string;
  active: boolean;
  reviewStatus: "bozza_da_rivedere" | "rivisto";
  source: "sillabo" | "istituto";
  customized: boolean;
  ord: number;
  requires: string[];
  requiresIds: number[];
}

interface Scope {
  subject: string;
  gradeLevel: string;
  total: number;
  active: number;
  toReview: number;
}

function scopeKey(s: { subject: string; gradeLevel: string }) {
  return `${s.subject}|${s.gradeLevel}`;
}

/** Una riga della mappa: lettura, modifica inline, conferma, attivazione. */
function ObjectiveRow({
  objective,
  onSave,
  onDelete,
  saving,
}: {
  objective: Objective;
  onSave: (id: number, patch: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(objective.title);
  const [description, setDescription] = useState(objective.description);

  const isDraft = objective.reviewStatus === "bozza_da_rivedere";

  async function save() {
    await onSave(objective.id, { title: title.trim(), description: description.trim(), reviewed: true });
    setEditing(false);
  }

  return (
    <div
      className={
        "rounded-lg border p-4 space-y-2 " +
        (objective.active ? "bg-card" : "bg-muted/40 opacity-70")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{objective.code}</span>
            {objective.source === "istituto" && <Badge variant="outline">Istituto</Badge>}
            {objective.customized && <Badge variant="outline">Adattato</Badge>}
            {isDraft ? (
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Bozza da rivedere</Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Rivisto
              </Badge>
            )}
            {!objective.active && <Badge variant="secondary">Disattivato</Badge>}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Cosa deve saper fare lo studente"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={saving || title.trim().length < 3}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Salva e conferma
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setTitle(objective.title);
                    setDescription(objective.description);
                  }}
                >
                  <X className="mr-1 h-4 w-4" /> Annulla
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-1 font-medium leading-snug">{objective.title}</div>
              {objective.description && (
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{objective.description}</p>
              )}
              {objective.requires.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" /> Richiede:
                  {objective.requires.map((code) => (
                    <span key={code} className="font-mono">
                      {code}
                    </span>
                  ))}
                </p>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5" title={objective.active ? "Attivo" : "Disattivato"}>
              <Switch
                checked={objective.active}
                disabled={saving}
                onCheckedChange={(checked) => onSave(objective.id, { active: checked })}
              />
            </div>
            <Button size="icon" variant="ghost" onClick={() => setEditing(true)} title="Modifica">
              <Pencil className="h-4 w-4" />
            </Button>
            {objective.source === "istituto" && (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                title="Elimina"
                disabled={saving}
                onClick={() => {
                  if (window.confirm(`Eliminare l'obiettivo ${objective.code}?`)) void onDelete(objective.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {isDraft && !editing && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>Testo proposto da Sillabo sulle Indicazioni nazionali: va letto da un docente.</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 bg-white"
            disabled={saving}
            onClick={() => onSave(objective.id, { reviewed: true })}
          >
            Va bene cosi'
          </Button>
        </div>
      )}
    </div>
  );
}

/** Form per aggiungere un obiettivo dell'istituto nella materia/anno scelti. */
function NewObjectiveForm({
  subject,
  gradeLevel,
  existing,
  onCreate,
  onClose,
}: {
  subject: string;
  gradeLevel: string;
  existing: Objective[];
  onCreate: (body: { subject: string; gradeLevel: string; title: string; description: string; requires: string[] }) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requires, setRequires] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onCreate({ subject, gradeLevel, title: title.trim(), description: description.trim(), requires });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Nuovo obiettivo — {subject}, {gradeLevel}</CardTitle>
        <CardDescription>Scritto dall'istituto: vale solo per la vostra scuola.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="obj-title">Titolo</Label>
          <Input id="obj-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Es. Risolvere problemi con le percentuali" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="obj-desc">Descrizione</Label>
          <Textarea id="obj-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Cosa deve saper fare lo studente" />
        </div>
        <div className="space-y-1.5">
          <Label>Richiede (propedeuticita')</Label>
          <div className="flex flex-wrap gap-1.5">
            {existing.map((o) => {
              const on = requires.includes(o.code);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setRequires((r) => (on ? r.filter((c) => c !== o.code) : [...r, o.code]))}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs transition-colors " +
                    (on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
                  }
                  title={o.title}
                >
                  {o.code}
                </button>
              );
            })}
            {!existing.length && <span className="text-xs text-muted-foreground">Nessun altro obiettivo in questa materia.</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || title.trim().length < 3}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Aggiungi
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CattedraObiettivi() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: institutions, isLoading: institutionsLoading } = useListInstitutions();
  const institutionId = institutions?.[0]?.id;

  const scopesKey = ["objectiveScopes", institutionId];
  const { data: scopesData, isLoading: scopesLoading } = useQuery({
    queryKey: scopesKey,
    enabled: !!institutionId,
    queryFn: () =>
      customFetch<{ scopes: Scope[] }>(`/api/institutions/${institutionId}/objectives/scopes`, { responseType: "json" }),
  });
  const scopes = scopesData?.scopes ?? [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (!scopes.length) return null;
    return scopes.find((s) => scopeKey(s) === selectedKey) ?? scopes[0];
  }, [scopes, selectedKey]);

  const listKey = ["objectives", institutionId, selected?.subject, selected?.gradeLevel];
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: listKey,
    enabled: !!institutionId && !!selected,
    queryFn: () =>
      customFetch<{ objectives: Objective[] }>(
        `/api/institutions/${institutionId}/objectives?subject=${encodeURIComponent(selected!.subject)}&gradeLevel=${encodeURIComponent(selected!.gradeLevel)}&includeInactive=1`,
        { responseType: "json" },
      ),
  });
  const objectives = listData?.objectives ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["objectives", institutionId] });
    void queryClient.invalidateQueries({ queryKey: scopesKey });
  };

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      customFetch(`/api/institutions/${institutionId}/objectives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        responseType: "json",
      }),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      toast({ title: "Modifica non salvata", description: err instanceof Error ? err.message : "Riprova.", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/institutions/${institutionId}/objectives/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      toast({ title: "Eliminazione non riuscita", description: err instanceof Error ? err.message : "Riprova.", variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch(`/api/institutions/${institutionId}/objectives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        responseType: "json",
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Obiettivo aggiunto" });
    },
    onError: (err: unknown) =>
      toast({ title: "Obiettivo non aggiunto", description: err instanceof Error ? err.message : "Riprova.", variant: "destructive" }),
  });

  const [adding, setAdding] = useState(false);
  const [newScope, setNewScope] = useState<{ subject: string; gradeLevel: string } | null>(null);

  const toReviewTotal = scopes.reduce((acc, s) => acc + s.toReview, 0);

  if (institutionsLoading || scopesLoading) {
    return (
      <TeacherLayout>
        <div className="p-8 max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40" />
        </div>
      </TeacherLayout>
    );
  }

  if (!institutionId) {
    return (
      <TeacherLayout>
        <div className="p-8 max-w-5xl mx-auto">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              La mappa degli obiettivi appartiene all'istituto: crea o entra in un istituto da "Istituto".
            </CardContent>
          </Card>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-7 w-7 text-primary" /> Obiettivi di apprendimento
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Il vocabolario con cui Sillabo descrive cosa uno studente sa fare. Le correzioni, il recupero e la
              mappa della classe parlano tutti in termini di questi obiettivi: per questo il dipartimento li rilegge e
              li fa propri.
            </p>
          </div>
          {toReviewTotal > 0 && (
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 text-sm px-3 py-1">
              {toReviewTotal} bozze da rivedere
            </Badge>
          )}
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 min-w-64">
              <Label>Materia e anno</Label>
              <Select
                value={selected ? scopeKey(selected) : undefined}
                onValueChange={(v) => {
                  setSelectedKey(v);
                  setAdding(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scegli" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((s) => (
                    <SelectItem key={scopeKey(s)} value={scopeKey(s)}>
                      {s.subject} — {s.gradeLevel} ({s.active} attivi{s.toReview ? `, ${s.toReview} da rivedere` : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setNewScope(selected ? { subject: selected.subject, gradeLevel: selected.gradeLevel } : null);
                setAdding(true);
              }}
              disabled={!selected}
            >
              <Plus className="mr-2 h-4 w-4" /> Aggiungi obiettivo
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setNewScope({ subject: "", gradeLevel: "" });
                setAdding(true);
              }}
            >
              Nuova materia o anno
            </Button>
          </CardContent>
        </Card>

        {adding && newScope && (newScope.subject && newScope.gradeLevel ? (
          <NewObjectiveForm
            subject={newScope.subject}
            gradeLevel={newScope.gradeLevel}
            existing={objectives.filter((o) => o.subject === newScope.subject)}
            onCreate={async (body) => {
              await create.mutateAsync(body);
            }}
            onClose={() => setAdding(false)}
          />
        ) : (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="text-base">Nuova materia o anno</CardTitle>
              <CardDescription>Scrivi materia e anno come compaiono nelle classi (es. "Italiano", "1ª Superiore").</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ns-subject">Materia</Label>
                <Input id="ns-subject" value={newScope.subject} onChange={(e) => setNewScope({ ...newScope, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-grade">Anno</Label>
                <Input id="ns-grade" value={newScope.gradeLevel} onChange={(e) => setNewScope({ ...newScope, gradeLevel: e.target.value })} placeholder="1ª Superiore" />
              </div>
              <Button
                disabled={!newScope.subject.trim() || !newScope.gradeLevel.trim()}
                onClick={() => setNewScope({ subject: newScope.subject.trim(), gradeLevel: newScope.gradeLevel.trim() })}
              >
                Continua
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Annulla
              </Button>
            </CardContent>
          </Card>
        ))}

        {listLoading ? (
          <Skeleton className="h-64" />
        ) : !selected ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nessuna mappa ancora: aggiungi la prima materia.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {objectives.map((o) => (
              <ObjectiveRow
                key={o.id}
                objective={o}
                saving={patch.isPending || remove.isPending}
                onSave={async (id, body) => {
                  await patch.mutateAsync({ id, body });
                }}
                onDelete={async (id) => {
                  await remove.mutateAsync(id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
