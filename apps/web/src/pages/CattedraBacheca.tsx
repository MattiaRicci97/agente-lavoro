import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone,
  Sparkles,
  Pin,
  PinOff,
  Trash2,
  Eye,
  MessageCircle,
  Send,
  Loader2,
} from "lucide-react";
import { KIND_META, type PostKind, PostComments } from "@/components/BachecaPost";

interface Post {
  id: number;
  classId: number;
  className: string;
  authorName: string;
  kind: PostKind;
  title: string;
  body: string;
  pinned: boolean;
  commentsEnabled: boolean;
  aiAssisted: boolean;
  createdAt: string;
  commentsCount: number;
  readCount: number;
  studentsCount: number;
}

interface Feed {
  role: "docente" | "studente";
  classes: { id: number; name: string; gradeLevel: string }[];
  posts: Post[];
}

interface Readers {
  students: { name: string; readAt: string | null }[];
  readCount: number;
  studentsCount: number;
}

/** Elenco di chi ha letto e chi no: serve al docente per sapere chi richiamare. */
function ReadersPanel({ postId }: { postId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["postReaders", postId],
    queryFn: () => customFetch<Readers>(`/api/class-posts/${postId}/readers`, { responseType: "json" }),
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data?.students.length) {
    return <p className="text-sm text-muted-foreground">Non ci sono ancora studenti iscritti a questa classe.</p>;
  }

  const nonLetti = data.students.filter((s) => !s.readAt);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {data.students.map((s) => (
          <span
            key={s.name}
            className={
              s.readAt
                ? "rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
                : "rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            }
            title={s.readAt ? `Letto il ${new Date(s.readAt).toLocaleString("it-IT")}` : "Non ancora letto"}
          >
            {s.name}
          </span>
        ))}
      </div>
      {nonLetti.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {nonLetti.length} student{nonLetti.length === 1 ? "e" : "i"} non {nonLetti.length === 1 ? "ha" : "hanno"}{" "}
          ancora aperto l'avviso.
        </p>
      )}
    </div>
  );
}

export default function CattedraBacheca() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: feed, isLoading } = useQuery({
    queryKey: ["classFeed"],
    queryFn: () => customFetch<Feed>("/api/class-posts/feed", { responseType: "json" }),
  });

  const classes = feed?.classes ?? [];
  const [classId, setClassId] = useState<number | null>(null);
  const activeClassId = classId ?? classes[0]?.id ?? null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [alsoClassIds, setAlsoClassIds] = useState<number[]>([]);
  const [hint, setHint] = useState("");
  const [aiAssisted, setAiAssisted] = useState(false);
  const [openReaders, setOpenReaders] = useState<number | null>(null);
  const [openComments, setOpenComments] = useState<number | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["classFeed"] });

  const draft = useMutation({
    mutationFn: () =>
      customFetch<{ title: string; body: string }>("/api/class-posts/draft", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ classId: activeClassId, hint: hint.trim() }),
      }),
    onSuccess: (d) => {
      setTitle(d.title);
      setBody(d.body);
      setAiAssisted(true);
      setHint("");
      toast({
        title: "Bozza pronta",
        description: "Rileggila e correggila: viene pubblicata a tuo nome.",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Bozza non riuscita",
        description: err?.data?.error ?? "Riprova, o scrivi l'avviso a mano.",
        variant: "destructive",
      }),
  });

  const publish = useMutation({
    mutationFn: () =>
      customFetch(`/api/classes/${activeClassId}/posts`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ title, body, pinned, commentsEnabled, aiAssisted, alsoClassIds }),
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setPinned(false);
      setCommentsEnabled(true);
      setAlsoClassIds([]);
      setAiAssisted(false);
      toast({ title: "Avviso pubblicato", description: "La classe lo vede subito." });
      refresh();
    },
    onError: (err: any) =>
      toast({
        title: "Pubblicazione non riuscita",
        description: err?.data?.error ?? "Riprova tra un momento.",
        variant: "destructive",
      }),
  });

  const togglePin = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      customFetch(`/api/class-posts/${id}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ pinned }),
      }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/class-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Avviso rimosso" });
      refresh();
    },
  });

  if (isLoading) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-3xl space-y-6 p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </TeacherLayout>
    );
  }

  if (!classes.length) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-3xl p-8">
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <Megaphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nessuna classe</h3>
            <p className="text-muted-foreground">Crea prima una classe: la bacheca parla ai tuoi studenti.</p>
          </div>
        </div>
      </TeacherLayout>
    );
  }

  const posts = feed?.posts ?? [];

  return (
    <TeacherLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Bacheca</h1>
          <p className="mt-1 text-muted-foreground">
            Il posto dove parli alle tue classi. Gli avvisi escono a tuo nome: Sillabo fa solo da lavagna.
          </p>
        </div>

        {/* Composizione */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label className="text-xs">Classe</Label>
                <Select
                  value={String(activeClassId ?? "")}
                  onValueChange={(v) => {
                    setClassId(Number(v));
                    setAlsoClassIds([]);
                  }}
                >
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
            </div>

            {/* Bozza assistita: l'AI scrive, il docente decide */}
            <div className="rounded-lg border border-dashed bg-muted/20 p-3">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Butta giù due parole, te lo scrivo io (poi lo correggi tu)
              </Label>
              <div className="mt-2 flex gap-2">
                <Input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="es. domani verifica rimandata, portare il libro di storia"
                  className="bg-card"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hint.trim().length >= 3) draft.mutate();
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => draft.mutate()}
                  disabled={draft.isPending || hint.trim().length < 3}
                >
                  {draft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Prepara"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Titolo</Label>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setAiAssisted(false);
                }}
                placeholder="es. Verifica di storia spostata a venerdì"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Testo</Label>
              <Textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setAiAssisted(false);
                }}
                placeholder="Scrivi qui l'avviso per la classe..."
                className="min-h-[120px] resize-none"
              />
            </div>

            {classes.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs">Pubblica anche in</Label>
                <div className="flex flex-wrap gap-3">
                  {classes
                    .filter((c) => c.id !== activeClassId)
                    .map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={alsoClassIds.includes(c.id)}
                          onCheckedChange={(v) =>
                            setAlsoClassIds((prev) =>
                              v ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                            )
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6 border-t pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={pinned} onCheckedChange={setPinned} />
                Fissa in cima
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
                Permetti domande
              </label>
              <Button
                className="ml-auto"
                onClick={() => publish.mutate()}
                disabled={publish.isPending || !title.trim()}
              >
                <Send className="mr-2 h-4 w-4" />
                Pubblica
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bacheca */}
        {!posts.length ? (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <Megaphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">La bacheca è vuota</h3>
            <p className="text-muted-foreground">
              Il primo avviso che pubblichi compare qui, insieme a materiali, compiti e verifiche.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => {
              const meta = KIND_META[p.kind] ?? KIND_META.avviso;
              const Icon = meta.icon;
              return (
                <Card key={p.id} className={p.pinned ? "border-primary/30" : undefined}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{p.className}</Badge>
                      {p.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("it-IT")}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-medium">{p.title}</h3>
                      {p.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => setOpenReaders(openReaders === p.id ? null : p.id)}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Letto da {p.readCount}/{p.studentsCount}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => setOpenComments(openComments === p.id ? null : p.id)}
                      >
                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                        {p.commentsCount === 0
                          ? p.commentsEnabled
                            ? "Nessuna domanda"
                            : "Domande chiuse"
                          : `${p.commentsCount} messaggi`}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-muted-foreground"
                        onClick={() => togglePin.mutate({ id: p.id, pinned: !p.pinned })}
                        aria-label={p.pinned ? "Togli dalla cima" : "Fissa in cima"}
                      >
                        {p.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(p.id)}
                        aria-label="Rimuovi l'avviso"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {openReaders === p.id && (
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <ReadersPanel postId={p.id} />
                      </div>
                    )}

                    {openComments === p.id && <PostComments postId={p.id} canWrite />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
