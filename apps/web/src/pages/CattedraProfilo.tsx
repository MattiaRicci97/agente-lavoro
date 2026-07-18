import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X, Trash2 } from "lucide-react";

interface TeachingPlace {
  name: string;
  contract: string;
}
interface TeacherProfile {
  id: number;
  name: string;
  email: string;
  title: string | null;
  subjects: string[];
  teachingPlaces: TeachingPlace[];
}

const TITLES = ["Prof.", "Prof.ssa", "Dott.", "Dott.ssa", "Ing.", "Arch."];
const NO_TITLE = "__nessuno__";

export default function CattedraProfilo() {
  const { toast } = useToast();

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ["teacherProfile"],
    queryFn: () => customFetch<TeacherProfile>("/api/teachers/me", { responseType: "json" }),
  });

  const [name, setName] = useState("");
  const [title, setTitle] = useState<string>(NO_TITLE);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [places, setPlaces] = useState<TeachingPlace[]>([]);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setTitle(profile.title || NO_TITLE);
      setSubjects(profile.subjects ?? []);
      setPlaces(profile.teachingPlaces ?? []);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: (body: Partial<TeacherProfile>) =>
      customFetch<TeacherProfile>("/api/teachers/me", {
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

  function addSubject() {
    const v = subjectDraft.trim();
    if (v && !subjects.includes(v)) setSubjects([...subjects, v]);
    setSubjectDraft("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      title: title === NO_TITLE ? null : title,
      subjects,
      teachingPlaces: places.filter((p) => p.name.trim().length > 0),
    });
  }

  return (
    <TeacherLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Il mio profilo</h1>
          <p className="text-muted-foreground mt-1">Le tue informazioni come docente: nome, materie e dove insegni.</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dati personali</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
                  <div className="space-y-2">
                    <Label>Titolo</Label>
                    <Select value={title} onValueChange={setTitle}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_TITLE}>Nessuno</SelectItem>
                        {TITLES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome e cognome</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Maria Bianchi" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Materie insegnate</CardTitle>
                <CardDescription>Aggiungi le materie che insegni.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={subjectDraft}
                    onChange={(e) => setSubjectDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSubject();
                      }
                    }}
                    placeholder="es. Matematica"
                  />
                  <Button type="button" variant="secondary" onClick={addSubject}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {subjects.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <Badge key={s} variant="secondary" className="gap-1 pr-1">
                        {s}
                        <button
                          type="button"
                          onClick={() => setSubjects(subjects.filter((x) => x !== s))}
                          className="rounded-full hover:bg-black/10 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dove insegni</CardTitle>
                <CardDescription>
                  Elenca gli istituti o le università dove insegni, con il tipo di contratto per ciascuno. Puoi aggiungerne più di uno.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {places.map((p, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={p.name}
                      onChange={(e) => setPlaces(places.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="Istituto / Università"
                      className="flex-1"
                    />
                    <Input
                      value={p.contract}
                      onChange={(e) => setPlaces(places.map((x, j) => (j === i ? { ...x, contract: e.target.value } : x)))}
                      placeholder="Contratto (es. tempo indeterminato, ricercatore, supplenza)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPlaces(places.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => setPlaces([...places, { name: "", contract: "" }])}>
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi sede
                </Button>
              </CardContent>
            </Card>

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
          </form>
        )}
      </div>
    </TeacherLayout>
  );
}
