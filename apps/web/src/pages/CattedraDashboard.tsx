import {
  useGetDashboardSummary,
  useListMaterials,
  useListClasses,
  useDeleteMaterial,
  getListMaterialsQueryKey,
  getGetDashboardSummaryQueryKey,
  customFetch,
} from "@sillabo/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { Plus, Users, BookOpen, BrainCircuit, Activity, GraduationCap, Trash2, Loader2, AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AlertStudent {
  id: number;
  name: string;
  className: string;
  besDsa: boolean;
  accuracyPercent: number | null;
  lastActivityAt: string | null;
  studyMinutes: number;
  attemptsCount: number;
  oralsCount: number;
  atRisk: boolean;
  reasons: string[];
}

function StudentAlertsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["teacherAlerts"],
    queryFn: () => customFetch<{ students: AlertStudent[] }>("/api/teacher/alerts", { responseType: "json" }),
  });

  const students = data?.students ?? [];
  const atRisk = students.filter((s) => s.atRisk);
  if (isLoading || students.length === 0) return null;

  return (
    <Card className={atRisk.length ? "border-amber-300/60" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {atRisk.length ? (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Studenti da attenzionare ({atRisk.length})
            </>
          ) : (
            <>
              <Users className="h-4 w-4 text-muted-foreground" />
              Tutti gli studenti sono in carreggiata 🎉
            </>
          )}
        </CardTitle>
        <CardDescription>
          Segnaliamo chi non si esercita da oltre 7 giorni o ha un'accuratezza sotto il 50%.
        </CardDescription>
      </CardHeader>
      {atRisk.length > 0 && (
        <CardContent className="space-y-2.5">
          {atRisk.slice(0, 6).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-2.5">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {s.name} <span className="text-xs text-muted-foreground font-normal">· {s.className}</span>
                </div>
                <div className="text-xs text-amber-700 mt-0.5">{s.reasons.join(" · ")}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                {s.studyMinutes > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {s.studyMinutes} min
                  </span>
                )}
                {s.accuracyPercent !== null && <Badge variant="outline">{s.accuracyPercent}%</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumBadge } from "@/components/CurriculumBadge";
import { useToast } from "@/hooks/use-toast";

function StatCard({
  label,
  icon: Icon,
  value,
  loading,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  loading: boolean;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="font-display text-3xl font-semibold text-primary">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteMaterialButton({ id, title }: { id: number; title: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMaterial = useDeleteMaterial();

  function onConfirm() {
    deleteMaterial.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Materiale eliminato", description: `"${title}" è stato rimosso.` });
          queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.data?.error ?? "Impossibile eliminare il materiale. Riprova.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Elimina materiale">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questo materiale?</AlertDialogTitle>
          <AlertDialogDescription>
            Stai per eliminare <strong>{title}</strong>. Verranno rimossi anche le domande, i quiz e le simulazioni collegate.
            L'operazione non è reversibile.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleteMaterial.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMaterial.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Eliminazione...
              </>
            ) : (
              "Elimina"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function CattedraDashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: materials, isLoading: materialsLoading } = useListMaterials();
  const { data: classes, isLoading: classesLoading } = useListClasses();

  const hasNoClasses = !classesLoading && classes?.length === 0;

  return (
    <TeacherLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Buongiorno, Prof.</h1>
            <p className="text-muted-foreground mt-1">Ecco l'andamento delle sue classi oggi.</p>
          </div>
          <Button asChild>
            <Link href="/cattedra/nuovo">
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Materiale
            </Link>
          </Button>
        </div>

        {hasNoClasses && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <GraduationCap className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-medium">Inizia da qui: crea il tuo istituto e la prima classe</h3>
                <p className="text-sm text-muted-foreground">
                  Ti serve una classe per assegnare i materiali e far entrare gli studenti con un codice.
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/cattedra/classi">Crea una classe</Link>
            </Button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Materiali Caricati" icon={BookOpen} loading={summaryLoading} value={summary?.materialsCount || 0} />
          <StatCard label="Domande Generate" icon={BrainCircuit} loading={summaryLoading} value={summary?.totalQuestions || 0} />
          <StatCard label="Esercitazioni" icon={Activity} loading={summaryLoading} value={summary?.totalQuizAttempts || 0} />
          <StatCard label="Media Classe" icon={Users} loading={summaryLoading} value={`${summary?.averageQuizScorePercent || 0}%`} />
        </div>

        <StudentAlertsCard />

        <div className="space-y-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-primary">I suoi materiali</h2>
          {materialsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : materials?.length === 0 ? (
            <div className="text-center p-12 border rounded-lg bg-card border-dashed">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nessun materiale</h3>
              <p className="text-muted-foreground mb-4">Inizia caricando il tuo primo materiale didattico.</p>
              <Button asChild variant="secondary">
                <Link href="/cattedra/nuovo">Carica Materiale</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {materials?.map(material => (
                <Card key={material.id} className="transition-shadow hover:shadow-md hover:border-primary/30">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <h3 className="font-display font-semibold text-lg">{material.title}</h3>
                      <p className="text-sm text-muted-foreground">{material.subject} • {material.gradeLevel}</p>
                      <CurriculumBadge topic={material.curriculumTopic} subtopic={material.curriculumSubtopic} />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-right text-muted-foreground mr-4">
                        <div>{material.questionCount} domande</div>
                        <div>{new Date(material.createdAt).toLocaleDateString("it-IT")}</div>
                      </div>
                      <Button asChild variant="outline">
                        <Link href={`/cattedra/material/${material.id}`}>Gestisci</Link>
                      </Button>
                      <DeleteMaterialButton id={material.id} title={material.title} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}
