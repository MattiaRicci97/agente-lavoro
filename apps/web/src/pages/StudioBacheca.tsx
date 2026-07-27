import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, MessageCircle, Pin, ArrowRight } from "lucide-react";
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
  createdAt: string;
  commentsCount: number;
  readByMe: boolean;
  materialId: number | null;
  writtenExamId: number | null;
}

interface Feed {
  role: "docente" | "studente";
  classes: { id: number; name: string; gradeLevel: string }[];
  posts: Post[];
}

/** Dove porta l'avviso, quando parla di qualcosa che si può aprire. */
function destinationOf(post: Post): { href: string; label: string } | null {
  if (post.kind === "compito" && post.materialId) {
    return { href: `/studio/material/${post.materialId}/scritto`, label: "Vai al compito" };
  }
  if (post.materialId) {
    return { href: `/studio/material/${post.materialId}/quiz`, label: "Apri il materiale" };
  }
  if (post.kind === "verifica") {
    return { href: "/studio/ripasso", label: "Prepara il ripasso" };
  }
  return null;
}

export default function StudioBacheca() {
  const queryClient = useQueryClient();
  const [openComments, setOpenComments] = useState<number | null>(null);

  const { data: feed, isLoading } = useQuery({
    queryKey: ["classFeed"],
    queryFn: () => customFetch<Feed>("/api/class-posts/feed", { responseType: "json" }),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => customFetch(`/api/class-posts/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unreadPosts"] });
      queryClient.invalidateQueries({ queryKey: ["classFeed"] });
    },
  });

  // Aprendo la bacheca gli avvisi risultano letti: è la ricevuta che il
  // docente vede, e serve a lui per sapere chi non li ha ancora visti.
  const posts = feed?.posts ?? [];
  const unreadIds = posts.filter((p) => !p.readByMe).map((p) => p.id);
  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (!unreadKey) return;
    for (const id of unreadKey.split(",").map(Number)) markRead.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-secondary">Bacheca</h1>
          <p className="mt-1 text-muted-foreground">Gli avvisi dei tuoi docenti, in ordine di arrivo.</p>
        </div>

        {!posts.length ? (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <Megaphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nessun avviso</h3>
            <p className="text-muted-foreground">
              Qui compaiono gli avvisi dei docenti, i compiti assegnati e le verifiche in calendario.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => {
              const meta = KIND_META[p.kind] ?? KIND_META.avviso;
              const Icon = meta.icon;
              const dest = destinationOf(p);
              return (
                <Card
                  key={p.id}
                  className={p.pinned ? "border-secondary/40 bg-secondary/5" : !p.readByMe ? "border-secondary/25" : undefined}
                >
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{p.className}</Badge>
                      {p.pinned && <Pin className="h-3.5 w-3.5 text-secondary" />}
                      {!p.readByMe && (
                        <span className="h-2 w-2 rounded-full bg-secondary" title="Nuovo" />
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("it-IT")}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-medium">{p.title}</h3>
                      {p.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">— {p.authorName}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      {dest && (
                        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                          <Link href={dest.href}>
                            {dest.label}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                      {(p.commentsEnabled || p.commentsCount > 0) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground"
                          onClick={() => setOpenComments(openComments === p.id ? null : p.id)}
                        >
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                          {p.commentsCount === 0 ? "Fai una domanda" : `${p.commentsCount} messaggi`}
                        </Button>
                      )}
                    </div>

                    {openComments === p.id && (
                      <PostComments postId={p.id} canWrite={p.commentsEnabled} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
