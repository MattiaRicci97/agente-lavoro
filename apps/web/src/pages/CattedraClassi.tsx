import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListInstitutions,
  getListInstitutionsQueryKey,
  useCreateInstitution,
  useListClasses,
  getListClassesQueryKey,
  useCreateClass,
  useListMaterials,
  customFetch,
} from "@sillabo/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, GraduationCap, Loader2, Users, Copy, Check, Plus, CalendarDays, Trash2 } from "lucide-react";

interface ExamDateRow {
  id: number;
  classId: number;
  materialId: number | null;
  title: string;
  subject: string;
  examDate: string;
  className: string;
}

function ExamCalendarSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes } = useListClasses();
  const { data: materials } = useListMaterials();

  const { data: exams } = useQuery({
    queryKey: ["examDates"],
    queryFn: () => customFetch<ExamDateRow[]>("/api/exam-dates", { responseType: "json" }),
  });

  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [materialId, setMaterialId] = useState("__nessuno__");
  const [examDate, setExamDate] = useState("");

  const createExam = useMutation({
    mutationFn: () =>
      customFetch<ExamDateRow>("/api/exam-dates", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          classId: Number(classId),
          title: title.trim(),
          subject: subject.trim(),
          materialId: materialId === "__nessuno__" ? null : Number(materialId),
          examDate,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Verifica programmata", description: "Gli studenti la vedranno nel loro piano di ripasso." });
      queryClient.invalidateQueries({ queryKey: ["examDates"] });
      setTitle("");
      setExamDate("");
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err?.data?.error ?? "Impossibile salvare la verifica.", variant: "destructive" });
    },
  });

  const deleteExam = useMutation({
    mutationFn: (id: number) => customFetch<void>(`/api/exam-dates/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["examDates"] }),
  });

  const canSubmit = classId && title.trim() && subject.trim() && examDate;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (exams ?? []).filter((e) => e.examDate >= today);

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle>Calendario verifiche</CardTitle>
          </div>
          <CardDescription>
            Fissa una verifica: gli studenti la vedranno in Studio e potranno generare il piano di ripasso a ritroso dalla data
            (se colleghi un materiale).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FormLabelPlain>Classe</FormLabelPlain>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona la classe" />
                </SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} — {c.gradeLevel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FormLabelPlain>Data</FormLabelPlain>
              <Input type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <FormLabelPlain>Titolo</FormLabelPlain>
              <Input placeholder="es. Verifica sul Romanticismo" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <FormLabelPlain>Materia</FormLabelPlain>
              <Input placeholder="es. Italiano" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <FormLabelPlain>Materiale collegato (per il piano di ripasso)</FormLabelPlain>
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nessuno__">Nessun materiale</SelectItem>
                  {(materials ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => createExam.mutate()} disabled={!canSubmit || createExam.isPending}>
            {createExam.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Programma verifica
          </Button>
        </CardContent>
      </Card>

      {upcoming.length > 0 && (
        <div className="space-y-3 max-w-3xl">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">In programma</h3>
          {upcoming.map((exam) => (
            <div key={exam.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div>
                <div className="font-medium">{exam.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {exam.className} • {exam.subject} •{" "}
                  {new Date(exam.examDate).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => deleteExam.mutate(exam.id)}
                disabled={deleteExam.isPending}
                title="Elimina"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormLabelPlain({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium leading-none">{children}</div>;
}

const GRADE_LEVELS = [
  "1ª Media",
  "2ª Media",
  "3ª Media",
  "1ª Superiore",
  "2ª Superiore",
  "3ª Superiore",
  "4ª Superiore",
  "5ª Superiore",
];

const institutionSchema = z.object({
  name: z.string().min(1, "Il nome dell'istituto è obbligatorio"),
  city: z.string().min(1, "La città è obbligatoria"),
});

const classSchema = z.object({
  name: z.string().min(1, "Il nome della classe è obbligatorio"),
  gradeLevel: z.string().min(1, "Seleziona l'anno"),
});

function CreateInstitutionCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createInstitution = useCreateInstitution();

  const form = useForm<z.infer<typeof institutionSchema>>({
    resolver: zodResolver(institutionSchema),
    defaultValues: { name: "", city: "" },
  });

  function onSubmit(values: z.infer<typeof institutionSchema>) {
    createInstitution.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Istituto creato", description: "Ora puoi creare le tue classi." });
          queryClient.invalidateQueries({ queryKey: getListInstitutionsQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.data?.error ?? "Impossibile creare l'istituto. Riprova.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle>Crea il tuo istituto</CardTitle>
        </div>
        <CardDescription>
          Per iniziare, registra la tua scuola. È un passaggio una tantum: dopo potrai creare tutte le classi che vuoi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome dell'istituto</FormLabel>
                  <FormControl>
                    <Input placeholder="es. Liceo Scientifico Galilei" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Città</FormLabel>
                  <FormControl>
                    <Input placeholder="es. Bologna" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={createInstitution.isPending}>
              {createInstitution.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creazione...
                </>
              ) : (
                "Crea istituto"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard non disponibile: l'utente può copiare a mano */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-sm font-semibold tracking-wider hover:bg-muted transition-colors"
      title="Copia il codice"
    >
      {code}
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

function ClassesSection({ institutionId }: { institutionId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes, isLoading } = useListClasses();
  const createClass = useCreateClass();

  const form = useForm<z.infer<typeof classSchema>>({
    resolver: zodResolver(classSchema),
    defaultValues: { name: "", gradeLevel: "" },
  });

  function onSubmit(values: z.infer<typeof classSchema>) {
    createClass.mutate(
      { data: { institutionId, name: values.name, gradeLevel: values.gradeLevel } },
      {
        onSuccess: () => {
          toast({ title: "Classe creata", description: "Condividi il codice con i tuoi studenti." });
          queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
          form.reset();
        },
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.data?.error ?? "Impossibile creare la classe. Riprova.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="space-y-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <CardTitle>Crea una classe</CardTitle>
          </div>
          <CardDescription>Dai un nome alla classe e scegli l'anno. Riceverai un codice da dare agli studenti.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row sm:items-end gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Nome della classe</FormLabel>
                    <FormControl>
                      <Input placeholder="es. 3ª B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem className="sm:w-48">
                    <FormLabel>Anno</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GRADE_LEVELS.map((lvl) => (
                          <SelectItem key={lvl} value={lvl}>
                            {lvl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={createClass.isPending}>
                {createClass.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creazione...
                  </>
                ) : (
                  "Crea classe"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Le tue classi</h2>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !classes?.length ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nessuna classe</h3>
            <p className="text-muted-foreground">Crea la tua prima classe qui sopra.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {classes.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-lg">{c.name}</div>
                      <div className="text-sm text-muted-foreground">{c.gradeLevel}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {c.studentsCount}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Codice per gli studenti:</span>
                    <JoinCode code={c.joinCode} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CattedraClassi() {
  const { data: institutions, isLoading } = useListInstitutions();
  const institution = institutions?.[0];

  return (
    <TeacherLayout>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Le mie classi</h1>
          <p className="text-muted-foreground mt-1">Gestisci il tuo istituto e le tue classi, e condividi i codici di iscrizione.</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full max-w-lg" />
        ) : !institution ? (
          <CreateInstitutionCard />
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span className="font-medium text-foreground">{institution.name}</span>
              <span>· {institution.city}</span>
            </div>
            <ClassesSection institutionId={institution.id} />
            <ExamCalendarSection />
          </>
        )}
      </div>
    </TeacherLayout>
  );
}
