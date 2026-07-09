import { useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  useListMaterials,
  listReviewItems,
  getListReviewItemsQueryKey,
  useUpdateReviewItem,
} from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { getSavedStudentName, saveStudentName } from "@/lib/studentName";

export default function StudioRipasso() {
  const [studentName, setStudentName] = useState(getSavedStudentName());
  const [activeName, setActiveName] = useState(getSavedStudentName());
  const queryClient = useQueryClient();

  const { data: materials, isLoading: materialsLoading } = useListMaterials();
  const updateReviewItem = useUpdateReviewItem();

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

  const handleStart = () => {
    if (!studentName.trim()) return;
    saveStudentName(studentName);
    setActiveName(studentName);
  };

  const handleComplete = (itemId: number, materialId: number) => {
    updateReviewItem.mutate(
      { id: itemId, data: { status: "completato" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListReviewItemsQueryKey(materialId, activeName) });
        },
      }
    );
  };

  if (!activeName) {
    return (
      <StudentLayout>
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <CalendarClock className="mx-auto h-10 w-10 text-secondary" />
                <h1 className="text-2xl font-bold">Il tuo piano di ripasso</h1>
                <p className="text-muted-foreground">Inserisci il tuo nome per vedere gli argomenti da ripassare.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="studentName">Il tuo nome</Label>
                  <Input
                    id="studentName"
                    placeholder="Mario Rossi"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  />
                </div>
                <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground" size="lg" onClick={handleStart}>
                  Vedi il mio piano
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-secondary">Piano di ripasso di {activeName}</h1>
          <p className="text-muted-foreground mt-1">Argomenti da ripassare a ripetizione spaziata, generati in base ai tuoi errori.</p>
        </div>

        {materialsLoading || isLoadingReviewItems ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !pendingItems.length && !doneItems.length ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <CalendarClock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nessun argomento da ripassare</h3>
            <p className="text-muted-foreground">Svolgi qualche quiz per generare il tuo piano di ripasso personalizzato.</p>
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
