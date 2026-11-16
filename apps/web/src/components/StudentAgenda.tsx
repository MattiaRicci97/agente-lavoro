import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, FileText, Compass, Target, CalendarClock, ClipboardList, ChevronRight, type LucideIcon } from "lucide-react";

interface AgendaEntry {
  kind: "compito" | "attivita" | "recupero" | "verifica" | "prova";
  title: string;
  subtitle: string;
  dueDate: string | null;
  link: string | null;
  when: "scaduto" | "oggi" | "domani" | "settimana" | "piu_avanti" | "senza_data";
  daysLeft: number | null;
}

const ICON: Record<AgendaEntry["kind"], LucideIcon> = {
  compito: FileText,
  attivita: Compass,
  recupero: Target,
  verifica: CalendarClock,
  prova: ClipboardList,
};

function whenLabel(e: AgendaEntry): string {
  if (e.when === "senza_data") return "quando vuoi";
  if (e.when === "oggi") return "oggi";
  if (e.when === "domani") return "domani";
  if (e.when === "scaduto") return e.daysLeft === -1 ? "scaduto ieri" : `scaduto da ${Math.abs(e.daysLeft!)} giorni`;
  const date = new Date(`${e.dueDate}T00:00:00`);
  return e.when === "settimana"
    ? date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" })
    : date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

const WHEN_STYLE: Record<AgendaEntry["when"], string> = {
  scaduto: "border-rose-200 bg-rose-50 text-rose-800",
  oggi: "border-amber-300 bg-amber-50 text-amber-900",
  domani: "border-amber-300 bg-amber-50 text-amber-900",
  settimana: "",
  piu_avanti: "text-muted-foreground",
  senza_data: "text-muted-foreground",
};

function Row({ e }: { e: AgendaEntry }) {
  const Icon = ICON[e.kind];
  const body = (
    <div className={`flex items-center gap-3 px-4 py-3 ${e.link ? "cursor-pointer transition-colors hover:bg-muted/40" : ""}`}>
      <Icon className="h-5 w-5 shrink-0 text-secondary" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 font-medium leading-snug">{e.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {e.kind === "verifica" ? "In calendario · " : ""}
          {e.subtitle}
        </div>
      </div>
      <Badge variant="outline" className={`shrink-0 font-normal ${WHEN_STYLE[e.when]}`}>
        {whenLabel(e)}
      </Badge>
      {e.link && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  return e.link ? <Link href={e.link}>{body}</Link> : body;
}

/**
 * "Cosa devo fare": compiti, attivita', richiami e verifiche in calendario
 * in un'unica lista ordinata per scadenza.
 */
export function StudentAgenda() {
  const { data, isLoading } = useQuery({
    queryKey: ["myAgenda"],
    queryFn: () => customFetch<{ items: AgendaEntry[] }>("/api/me/agenda", { responseType: "json" }),
  });
  if (isLoading) return null;
  const items = data?.items ?? [];

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-secondary">
        <CalendarCheck className="h-5 w-5" /> Cosa devo fare
      </h2>
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Niente in scadenza. Puoi ripassare con un quiz o chiedere al corso quello che non ti è chiaro.
            </p>
          ) : (
            <div className="divide-y">
              {items.slice(0, 8).map((e, i) => (
                <Row key={`${e.kind}-${i}`} e={e} />
              ))}
              {items.length > 8 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">e altre {items.length - 8} più avanti</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
