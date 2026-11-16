import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Compass, ChevronRight, CheckCircle2 } from "lucide-react";
import type { GuidedActivityItem } from "@/pages/StudioAttivita";

const STATUS: Record<GuidedActivityItem["status"], string> = {
  da_fare: "da fare",
  iniziata: "iniziata",
  completata: "completata",
};

/** Le attivita' guidate assegnate allo studente. Se non ce ne sono, non compare nulla. */
export function GuidedActivitiesList() {
  const { data } = useQuery({
    queryKey: ["myGuidedActivities"],
    queryFn: () => customFetch<{ activities: GuidedActivityItem[] }>("/api/me/guided-activities", { responseType: "json" }),
  });
  const activities = data?.activities ?? [];
  if (!activities.length) return null;
  // Prima quelle ancora aperte.
  const sorted = [...activities].sort((a, b) => Number(a.status === "completata") - Number(b.status === "completata"));

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attività dal tuo docente</div>
      {sorted.slice(0, 6).map((a) => (
        <Link key={a.id} href={`/studio/attivita/${a.id}`}>
          <div className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40">
            <Compass className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {a.subject}
                {a.dueDate && ` · entro il ${new Date(`${a.dueDate}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`}
              </div>
            </div>
            {a.status === "completata" ? (
              <Badge variant="outline" className="shrink-0 border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="mr-1 h-3 w-3" /> completata
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">{STATUS[a.status]}</Badge>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}
