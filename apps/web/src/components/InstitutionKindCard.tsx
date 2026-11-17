import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useInstitutionProfile, PROFILE_QUERY_KEY, type InstitutionKind } from "@/lib/institutionProfile";
import { School, Landmark, Briefcase, Check, type LucideIcon } from "lucide-react";

const DESCRIPTION: Record<InstitutionKind, { icon: LucideIcon; text: string }> = {
  scuola: { icon: School, text: "Classi, registro, scrutinio, Maturità, INVALSI e mappa degli obiettivi nazionale." },
  universita: { icon: Landmark, text: "Corsi al posto delle classi. Niente registro, scrutinio né prove nazionali; obiettivi scritti dall'ateneo." },
  business_school: { icon: Briefcase, text: "Come l'università, e gli studenti si chiamano partecipanti." },
};

/**
 * Per un amministratore: il tipo del suo istituto, che decide quali funzioni
 * compaiono e con quali parole. Non cancella nulla: le funzioni nascoste
 * tornano visibili cambiando di nuovo tipo.
 */
export function InstitutionKindCard() {
  const { profile } = useInstitutionProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const change = useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: InstitutionKind }) =>
      customFetch(`/api/institutions/${id}/kind`, { method: "PUT", responseType: "json", body: JSON.stringify({ kind }) }),
    onSuccess: () => {
      toast({ title: "Tipo di istituto aggiornato", description: "Menu e parole si adattano subito, per te e per i tuoi studenti." });
      void queryClient.invalidateQueries();
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
    onError: (err: any) =>
      toast({ title: "Errore", description: err?.data?.error ?? "Impossibile cambiare il tipo di istituto.", variant: "destructive" }),
  });

  if (!profile.adminInstitutions.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tipo di istituto</CardTitle>
        <CardDescription>
          Sillabo si presenta in modo diverso a seconda dell'istituto. Le funzioni non pertinenti vengono nascoste, non cancellate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {profile.adminInstitutions.map((inst) => (
          <div key={inst.id} className="space-y-2">
            {profile.adminInstitutions.length > 1 && <div className="text-sm font-medium">{inst.name}</div>}
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={`Tipo di ${inst.name}`}>
              {profile.kinds.map((k) => {
                const selected = inst.kind === k.kind;
                const { icon: Icon, text } = DESCRIPTION[k.kind];
                return (
                  <button
                    key={k.kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={change.isPending}
                    onClick={() => !selected && change.mutate({ id: inst.id, kind: k.kind })}
                    className={`flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex w-full items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-primary" />
                      {k.label}
                      {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
