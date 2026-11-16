import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ChevronRight } from "lucide-react";

interface MyTest {
  id: number;
  subject: string;
  title: string;
  minutes: number;
  done: boolean;
  score: number | null;
  total: number | null;
}

/** Le prove di allenamento gia' svolte: per rivedere risposte e spiegazioni. Quelle da fare stanno in "Cosa devo fare". */
export function StudentInvalsiList() {
  const { data } = useQuery({
    queryKey: ["myInvalsiTests"],
    queryFn: () => customFetch<{ tests: MyTest[] }>("/api/me/invalsi-tests", { responseType: "json" }),
  });
  const done = (data?.tests ?? []).filter((t) => t.done);
  if (!done.length) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allenamenti INVALSI svolti</h2>
      {done.slice(0, 5).map((t) => (
        <Link key={t.id} href={`/studio/prova/${t.id}`}>
          <div className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40">
            <ClipboardList className="h-5 w-5 shrink-0 text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.subject} · rivedi risposte e spiegazioni</div>
            </div>
            <Badge variant="outline" className="shrink-0 tabular-nums">
              {t.score}/{t.total}
            </Badge>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </section>
  );
}
