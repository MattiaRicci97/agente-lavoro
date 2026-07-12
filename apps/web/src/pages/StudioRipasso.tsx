import { useQueries, useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListMaterials,
  listReviewItems,
  getListReviewItemsQueryKey,
  useUpdateReviewItem,
  useGetMe,
  customFetch,
} from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CheckCircle2, Loader2, CalendarDays, Zap, Sparkles } from "lucide-react";

interface UpcomingExam {
  id: number;
  classId: number;
  materialId: number | null;
  title: string;
  subject: string;
  examDate: string;
  materialTitle: string | null;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(`${dateStr}T00:00:00`).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function StudioRipasso() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useGetMe();
  const activeName = me?.studentMemberships?.[0]?.name ?? "";

  const { data: materials, isLoading: materialsLoading } = useListMaterials();
  const updateReviewItem = useUpdateReviewItem();

  const { data: exams } = useQuery({
    queryKey: ["upcomingExams"],
    queryFn: () => customFetch<UpcomingExam[]>("/api/exam-dates/mine", { responseType: "json" }),
  });

  const generatePlan = useMutation({
    mutationFn: (examId: number) =>
      customFetch<{ created: number }>(`/api/exam-dates/${examId}/plan`, { method: "POST", responseType: "json" }),
    onSuccess: (data) => {
      toast({
        title: "Piano di ripasso creato",
        description: `${data.created} sessioni di ripasso aggiunte al tuo piano, a ritroso dalla verifica.`,
      });
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      toast({
        title: "Errore",
        description: err?.data?.error ?? "Impossibile creare il piano. Riprova.",
        variant: "destructive",
      });
    },
  });

  const reviewQueries = useQueries({
    queries: (materials || []).map((m) => ({
      queryKey: getListReviewItemsQueryKey(m.id, activeName),
      queryFn: () => listReviewItems(m.id, activeName),
      enabled: !!activeName && !!m.id,
    })),
  });

  const isLoadingReviewItems = !!activeName && reviewQueries.some((q) => q.isLoading);

  const allItems = reviewQueries
    .flatMap((q, i) => (q.data || []).map((item) => ({ ...item, materialTitle: materials?.[i]?.title || "" })))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const pendingItems = allItems.filter((i) => i.status === "da_fare");
  const doneItems = allItems.filter((i) => i.status === "completato");

  const handleComplete = (itemId: number, materialId: number) => {
    updateReviewItem.mutate(
      { id: itemId, data: { status: "completato" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListReviewItemsQueryKey(materialId, activeName) });
        },
      },
    );
  };

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-secondary">Il tuo piano di ripasso</h1>
            <p className="text-muted-foreground mt-1">Ripetizione spaziata sui tuoi errori e sulle verifiche in arrivo.</p>
          </div>
          {pendingItems.length > 0 && (
            <Button asChild className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
              <Link href="/studio/lampo">
                <Zap className="mr-2 h-4 w-4" />
                Hai 5 minuti?
              </Link>
            </Button>
          )}
        </div>

        {!!exams?.length && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-secondary" />
              Verifiche in arrivo
            </h2>
            {exams.map((exam) => {
              const days = daysUntil(exam.examDate);
              return (
                <Card key={exam.id} className={days <= 3 ? "border-destructive/40" : "border-secondary/30"}>
                  <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-medium">{exam.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {exam.subject}
                        {exam.materialTitle ? ` • ${exam.materialTitle}` : ""} •{" "}
                        {new Date(exam.examDate).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={days <= 3 ? "destructive" : "secondary"}>
                        {days === 0 ? "Oggi!" : days === 1 ? "Domani" : `tra ${days} giorni`}
                      </Badge>
                      {exam.materialId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generatePlan.mutate(exam.id)}
                          disabled={generatePlan.isPending}
                        >
                          {generatePlan.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                              Prepara il piano
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {materialsLoading || isLoadingReviewItems ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !pendingItems.length && !doneItems.length ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <CalendarClock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nessun argomento da ripassare</h3>
            <p className="text-muted-foreground">
              Svolgi qualche quiz (o premi "Prepara il piano" su una verifica) per generare il tuo piano personalizzato.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Da fare ({pendingItems.length})</h2>
              {!pendingItems.length ? (
                <div className="text-sm text-muted-foreground">Nessun argomento in sospeso, ottimo lavoro!</div>
              ) : (
                pendingItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{item.topic}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.materialTitle} • entro il {new Date(item.dueDate).toLocaleDateString("it-IT")}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleComplete(item.id, item.materialId)}
                        disabled={updateReviewItem.isPending}
                      >
                        {updateReviewItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Segna come fatto"}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {!!doneItems.length && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Completati ({doneItems.length})</h2>
                {doneItems.map((item) => (
                  <Card key={item.id} className="opacity-60">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{item.topic}</div>
                        <div className="text-xs text-muted-foreground mt-1">{item.materialTitle}</div>
                      </div>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Fatto
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
