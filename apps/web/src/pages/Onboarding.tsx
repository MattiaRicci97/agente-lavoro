import { useState } from "react";
import { useLocation } from "wouter";
import { useSetRole } from "@sillabo/api-client-react";
import { SetRoleInputRole } from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { BookOpen, GraduationCap, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setRole = useSetRole();
  const [selected, setSelected] = useState<"docente" | "studente" | null>(null);

  function choose(role: "docente" | "studente") {
    setSelected(role);
    setRole.mutate(
      { data: { role: role as SetRoleInputRole } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation(role === "docente" ? "/cattedra" : "/entra-in-classe");
        },
        onError: (err: any) => {
          setSelected(null);
          toast({
            title: "Errore",
            description: err?.response?.data?.error ?? "Impossibile impostare il ruolo.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <Logo className="text-primary justify-center" size="xl" />
          <h1 className="font-display text-3xl font-semibold text-primary">Come vuoi usare Sillabo?</h1>
          <p className="text-muted-foreground text-balance">Scegli il tuo ruolo per continuare. Questa scelta non potrà essere cambiata in seguito.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => choose("docente")}
            disabled={setRole.isPending}
            className="group p-8 bg-card rounded-2xl border border-card-border shadow-sm transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 flex flex-col items-center text-center space-y-4 disabled:opacity-60"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary transition-transform group-hover:scale-105">
              {setRole.isPending && selected === "docente" ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <BookOpen className="w-8 h-8" />
              )}
            </div>
            <h2 className="font-display text-xl font-semibold text-primary">Sono un docente</h2>
            <p className="text-muted-foreground text-sm">Carica materiali, gestisci le classi e approva le richieste degli studenti.</p>
          </button>

          <button
            type="button"
            onClick={() => choose("studente")}
            disabled={setRole.isPending}
            className="group p-8 bg-card rounded-2xl border border-card-border shadow-sm transition-all hover:shadow-md hover:border-secondary/40 hover:-translate-y-0.5 flex flex-col items-center text-center space-y-4 disabled:opacity-60"
          >
            <div className="w-16 h-16 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary transition-transform group-hover:scale-105">
              {setRole.isPending && selected === "studente" ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <GraduationCap className="w-8 h-8" />
              )}
            </div>
            <h2 className="font-display text-xl font-semibold text-secondary">Sono uno studente</h2>
            <p className="text-muted-foreground text-sm">Entra in una classe con il codice fornito dal tuo docente.</p>
          </button>
        </div>
      </div>
    </div>
  );
}
