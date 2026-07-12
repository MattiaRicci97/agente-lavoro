import {
  useGetDashboardSummary,
  useListMaterials,
  useListClasses,
  useDeleteMaterial,
  getListMaterialsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Plus, Users, BookOpen, BrainCircuit, Activity, GraduationCap, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumBadge } from "@/components/CurriculumBadge";
import { useToast } from "@/hooks/use-toast";

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
            <h1 className="text-3xl font-bold tracking-tight">Buongiorno, Prof.</h1>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Materiali Caricati</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{summary?.materialsCount || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Domande Generate</CardTitle>
              <BrainCircuit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{summary?.totalQuestions || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Esercitazioni</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{summary?.totalQuizAttempts || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Media Classe</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{summary?.averageQuizScorePercent || 0}%</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">I suoi materiali</h2>
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
                <Card key={material.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <h3 className="font-semibold text-lg">{material.title}</h3>
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
