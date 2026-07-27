import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, FileText, BookOpen, CalendarClock, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PostKind = "avviso" | "compito" | "materiale" | "verifica";

/** Come si presenta ciascun tipo di avviso sulla bacheca. */
export const KIND_META: Record<PostKind, { label: string; icon: LucideIcon; tone: string }> = {
  avviso: { label: "Avviso", icon: Megaphone, tone: "text-primary" },
  compito: { label: "Compito", icon: FileText, tone: "text-secondary" },
  materiale: { label: "Materiale", icon: BookOpen, tone: "text-emerald-700" },
  verifica: { label: "Verifica", icon: CalendarClock, tone: "text-amber-700" },
};

interface Comment {
  id: number;
  authorName: string;
  authorRole: "docente" | "studente";
  body: string;
  createdAt: string;
}

/**
 * Le domande sotto un avviso.
 *
 * Rispondono le persone: nessuna risposta automatica, per scelta. È lo spazio
 * in cui uno studente chiede al proprio docente, non a un assistente.
 */
export function PostComments({ postId, canWrite }: { postId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const queryKey = ["postComments", postId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => customFetch<Comment[]>(`/api/class-posts/${postId}/comments`, { responseType: "json" }),
  });

  const send = useMutation({
    mutationFn: () =>
      customFetch(`/api/class-posts/${postId}/comments`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ body: text.trim() }),
      }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["classFeed"] });
    },
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">Ancora nessuna domanda.</p>
      ) : (
        <div className="space-y-2.5">
          {data.map((c) => (
            <div key={c.id} className="text-sm">
              <span className={c.authorRole === "docente" ? "font-medium text-primary" : "font-medium"}>
                {c.authorName}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(c.createdAt).toLocaleDateString("it-IT")}
              </span>
              <p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi una domanda..."
            className="bg-card"
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) send.mutate();
            }}
          />
          <Button size="icon" onClick={() => send.mutate()} disabled={send.isPending || !text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
