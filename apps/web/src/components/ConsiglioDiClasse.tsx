import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Star, X, Users } from "lucide-react";

interface CouncilTeacher {
  id: number;
  teacherId: number;
  subject: string;
  role: "coordinatore" | "docente";
  name: string;
  email: string;
}

interface Council {
  teachers: CouncilTeacher[];
  isCoordinator: boolean;
}

/**
 * I docenti che lavorano su una classe.
 *
 * Una classe e' della scuola, non di chi l'ha creata: il coordinatore tiene
 * l'organico, gli altri insegnano con gli stessi poteri.
 */
export function ConsiglioDiClasse({ classId }: { classId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [adding, setAdding] = useState(false);

  const queryKey = ["classCouncil", classId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => customFetch<Council>(`/api/classes/${classId}/teachers`, { responseType: "json" }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["classes"] });
  };
  const fail = (fallback: string) => (err: any) =>
    toast({
      title: "Operazione non riuscita",
      description: err?.data?.error ?? fallback,
      variant: "destructive",
    });

  const addTeacher = useMutation({
    mutationFn: () =>
      customFetch(`/api/classes/${classId}/teachers`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ email: email.trim(), subject: subject.trim() }),
      }),
    onSuccess: () => {
      toast({ title: "Docente aggiunto al consiglio" });
      setEmail("");
      setSubject("");
      setAdding(false);
      refresh();
    },
    onError: fail("Impossibile aggiungere il docente."),
  });

  const setCoordinator = useMutation({
    mutationFn: (memberId: number) =>
      customFetch(`/api/classes/${classId}/teachers/${memberId}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ role: "coordinatore" }),
      }),
    onSuccess: refresh,
    onError: fail("Impossibile cambiare il coordinatore."),
  });

  const remove = useMutation({
    mutationFn: (memberId: number) =>
      customFetch(`/api/classes/${classId}/teachers/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Docente rimosso dalla classe" });
      refresh();
    },
    onError: fail("Impossibile rimuovere il docente."),
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  const teachers = data?.teachers ?? [];

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Consiglio di classe
        <span className="ml-auto normal-case tracking-normal">
          {teachers.length} docent{teachers.length === 1 ? "e" : "i"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {teachers.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm"
          >
            {t.role === "coordinatore" && <Star className="h-3 w-3 fill-secondary text-secondary" />}
            <span className="font-medium">{t.name}</span>
            {t.subject && <span className="text-xs text-muted-foreground">· {t.subject}</span>}
            {data?.isCoordinator && (
              <>
                {t.role !== "coordinatore" && (
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground opacity-0 transition-opacity hover:text-secondary group-hover:opacity-100"
                    onClick={() => setCoordinator.mutate(t.id)}
                    title="Rendi coordinatore"
                  >
                    <Star className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => remove.mutate(t.id)}
                  title={`Togli ${t.name} dalla classe`}
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {data?.isCoordinator &&
        (adding ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) addTeacher.mutate();
            }}
          >
            <div className="min-w-48 flex-1 space-y-1">
              <Label className="text-xs">Email del collega</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome.cognome@scuola.it"
                className="h-8 bg-card"
              />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-xs">Materia</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="es. Matematica"
                className="h-8 bg-card"
              />
            </div>
            <Button type="submit" size="sm" disabled={addTeacher.isPending || !email.trim()}>
              Aggiungi
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Annulla
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Aggiungi un collega
          </Button>
        ))}

      {!data?.isCoordinator && (
        <p className="text-xs text-muted-foreground">
          Il coordinatore <Badge variant="outline" className="mx-1 text-[10px]">
            <Star className="mr-1 h-2.5 w-2.5 fill-secondary text-secondary" />
          </Badge>
          gestisce chi insegna in questa classe.
        </p>
      )}
    </div>
  );
}

interface JoinableClass {
  id: number;
  name: string;
  gradeLevel: string;
  teacherName: string;
  studentsCount: number;
}

/** Le classi dell'istituto in cui il docente non insegna ancora. */
export function ClassiDaRaggiungere() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subjectById, setSubjectById] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["joinableClasses"],
    queryFn: () => customFetch<JoinableClass[]>("/api/classes/joinable", { responseType: "json" }),
  });

  const join = useMutation({
    mutationFn: (classId: number) =>
      customFetch(`/api/classes/${classId}/join`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ subject: (subjectById[classId] ?? "").trim() }),
      }),
    onSuccess: () => {
      toast({ title: "Sei entrato nella classe", description: "La trovi fra le tue classi." });
      queryClient.invalidateQueries({ queryKey: ["joinableClasses"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      window.location.reload();
    },
    onError: (err: any) =>
      toast({
        title: "Non sei entrato",
        description: err?.data?.error ?? "Riprova.",
        variant: "destructive",
      }),
  });

  if (isLoading || !data?.length) return null;

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-card p-4">
      <div>
        <h3 className="font-medium">Altre classi del tuo istituto</h3>
        <p className="text-sm text-muted-foreground">
          Non ricrearle: entra in quella in cui insegni, gli studenti sono già iscritti.
        </p>
      </div>
      <div className="space-y-2">
        {data.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2.5">
            <div className="min-w-0 flex-1">
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {c.gradeLevel} · {c.studentsCount} student{c.studentsCount === 1 ? "e" : "i"} · coord. {c.teacherName}
              </span>
            </div>
            <Input
              value={subjectById[c.id] ?? ""}
              onChange={(e) => setSubjectById((prev) => ({ ...prev, [c.id]: e.target.value }))}
              placeholder="La tua materia"
              className="h-8 w-40 bg-card"
            />
            <Button size="sm" variant="outline" onClick={() => join.mutate(c.id)} disabled={join.isPending}>
              Entra
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
