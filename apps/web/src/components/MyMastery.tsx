import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { MasteryList } from "@/components/MasteryList";
import type { MasteryRow } from "@/lib/mastery";

/** Il profilo dello studente, mostrato a lui: solo gli obiettivi ancora da consolidare. */
export function MyMastery() {
  const { data } = useQuery({
    queryKey: ["myMastery"],
    queryFn: () => customFetch<{ mastery: MasteryRow[] }>("/api/me/mastery", { responseType: "json" }),
  });
  const open = (data?.mastery ?? []).filter((m) => m.state === "fragile" || m.state === "mancante");
  return <MasteryList rows={open} audience="studente" />;
}
