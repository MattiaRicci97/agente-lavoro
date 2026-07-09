import { useListInstitutions, useListInstitutionModules, useToggleInstitutionModule, getListInstitutionModulesQueryKey } from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LayoutGrid } from "lucide-react";

export default function CattedraModuli() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: institutions, isLoading: institutionsLoading } = useListInstitutions();
  const institutionId = institutions?.[0]?.id;

  const { data: modules, isLoading: modulesLoading } = useListInstitutionModules(institutionId as number, {
    query: { enabled: !!institutionId, queryKey: getListInstitutionModulesQueryKey(institutionId as number) },
  });

  const toggleModule = useToggleInstitutionModule();

  const handleToggle = (moduleId: number, active: boolean) => {
    if (!institutionId) return;
    toggleModule.mutate(
      { id: institutionId, moduleId, data: { active } },
      {
        onSuccess: () => {
          toast({
            title: active ? "Modulo attivato" : "Modulo disattivato",
          });
          queryClient.invalidateQueries({ queryKey: getListInstitutionModulesQueryKey(institutionId) });
        },
        onError: () => {
          toast({ title: "Errore", description: "Impossibile aggiornare il modulo.", variant: "destructive" });
        },
      }
    );
  };

  const isLoading = institutionsLoading || modulesLoading;

  const groupedModules = (modules || []).reduce<Record<string, typeof modules>>((acc, m) => {
    acc[m.category] = acc[m.category] || [];
    acc[m.category]!.push(m);
    return acc;
  }, {});

  return (
    <TeacherLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catalogo Moduli</h1>
          <p className="text-muted-foreground mt-1">Attiva le funzionalità della piattaforma in base alle esigenze del tuo istituto.</p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : !modules?.length ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <LayoutGrid className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nessun modulo disponibile</h3>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedModules).map(([category, mods]) => (
              <div key={category} className="space-y-4">
                <h2 className="text-lg font-semibold tracking-tight">{category}</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {mods!.map((m) => (
                    <Card key={m.id} className={m.active ? "border-primary/40" : ""}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{m.name}</CardTitle>
                          <Switch
                            checked={m.active}
                            onCheckedChange={(checked) => handleToggle(m.id, checked)}
                            disabled={toggleModule.isPending}
                          />
                        </div>
                        <CardDescription>{m.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs font-medium text-muted-foreground">{m.priceLabel}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
