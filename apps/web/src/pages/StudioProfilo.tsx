import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface StudentProfile {
  name: string;
  besDsa: boolean;
}

export default function StudioProfilo() {
  const { toast } = useToast();

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ["studentProfile"],
    queryFn: () => customFetch<StudentProfile>("/api/students/me", { responseType: "json" }),
  });

  const [name, setName] = useState("");
  const [besDsa, setBesDsa] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setBesDsa(!!profile.besDsa);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: (body: StudentProfile) =>
      customFetch<StudentProfile>("/api/students/me", {
        method: "PATCH",
        body: JSON.stringify(body),
        responseType: "json",
      }),
    onSuccess: () => {
      toast({ title: "Profilo salvato", description: "Le tue informazioni sono state aggiornate." });
      refetch();
    },
    onError: (err: any) => {
      toast({
        title: "Errore",
        description: err?.data?.error ?? "Impossibile salvare il profilo. Riprova.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({ name: name.trim(), besDsa });
  }

  return (
    <StudentLayout>
      <div className="max-w-xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Il mio profilo</h1>
          <p className="text-muted-foreground mt-1">Le tue informazioni.</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <form onSubmit={onSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Dati personali</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome e cognome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Luca Rossi" />
                </div>

                <div className="rounded-lg border p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox checked={besDsa} onCheckedChange={(v) => setBesDsa(v === true)} className="mt-0.5" />
                    <span>
                      <span className="font-medium">Ho una certificazione BES/DSA</span>
                      <span className="block text-sm text-muted-foreground">
                        Attiva i materiali semplificati e gli strumenti compensativi dove disponibili.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvataggio...
                      </>
                    ) : (
                      "Salva profilo"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        )}
      </div>
    </StudentLayout>
  );
}
