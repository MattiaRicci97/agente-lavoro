import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";

interface Notice {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
}

/** Avvisi personali dello studente (es. un recupero approvato dal docente). */
export function StudentNotices() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["myNotices"],
    queryFn: () => customFetch<{ notices: Notice[] }>("/api/me/notices", { responseType: "json" }),
  });
  const read = useMutation({
    mutationFn: (id: number) => customFetch(`/api/me/notices/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myNotices"] }),
  });
  const notices = data?.notices ?? [];
  if (!notices.length) return null;

  return (
    <div className="space-y-2">
      {notices.map((n) => (
        <div key={n.id} className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{n.title}</div>
            <p className="text-sm text-muted-foreground">{n.body}</p>
            {n.link && (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={n.link}>Apri</Link>
              </Button>
            )}
          </div>
          <Button size="icon" variant="ghost" title="Ho letto" onClick={() => read.mutate(n.id)} disabled={read.isPending}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
