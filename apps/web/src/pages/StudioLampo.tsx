import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  useListMaterials,
  listReviewItems,
  getListReviewItemsQueryKey,
  listQuestions,
  useUpdateReviewItem,
  useGetMe,
} from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Eye, ThumbsUp, RotateCcw, PartyPopper, ArrowLeft } from "lucide-react";

/**
 * Ripasso lampo: fino a 5 richiami attivi presi dagli argomenti piu' urgenti
 * del piano di ripasso. Autovalutazione, zero costi AI, perfetto per 5 minuti.
 */
export default function StudioLampo() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const activeName = me?.studentMemberships?.[0]?.name ?? "";

  const { data: materials, isLoading: materialsLoading } = useListMaterials();
  const updateReviewItem = useUpdateReviewItem();

  const reviewQueries = useQueries({
    queries: (materials || []).map((m) => ({
      queryKey: getListReviewItemsQueryKey(m.id, activeName),
      queryFn: () => listReviewItems(m.id, activeName),
      enabled: !!activeName && !!m.id,
    })),
  });

  const pendingItems = useMemo(
    () =>
      reviewQueries
        .flatMap((q, i) => (q.data || []).map((item) => ({ ...item, materialTitle: materials?.[i]?.title || "" })))
        .filter((i) => i.status === "da_fare")
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        // un solo richiamo per argomento
        .filter((item, idx, arr) => arr.findIndex((x) => x.topic === item.topic && x.materialId === item.materialId) === idx)
        .slice(0, 5),
    [reviewQueries, materials],
  );

  // Carica le domande dei materiali coinvolti per pescare un quesito per argomento.
  const materialIdsNeeded = useMemo(() => Array.from(new Set(pendingItems.map((i) => i.materialId))), [pendingItems]);
  const questionQueries = useQueries({
    queries: materialIdsNeeded.map((mid) => ({
      queryKey: ["questions", mid],
      queryFn: () => listQuestions(mid),
      enabled: pendingItems.length > 0,
    })),
  });

  const cards = useMemo(() => {
    const questionsByMaterial = new Map(materialIdsNeeded.map((mid, i) => [mid, questionQueries[i]?.data || []]));
    return pendingItems.map((item) => {
      const pool = questionsByMaterial.get(item.materialId) || [];
      const question = pool.find((q) => q.topic === item.topic) ?? pool[0] ?? null;
      return { item, question };
    });
  }, [pendingItems, questionQueries, materialIdsNeeded]);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const isLoading =
    materialsLoading || reviewQueries.some((q) => q.isLoading) || questionQueries.some((q) => q.isLoading);

  const current = cards[index];

  function next(knewIt: boolean) {
    if (knewIt && current) {
      setKnownCount((c) => c + 1);
      updateReviewItem.mutate(
        { id: current.item.id, data: { status: "completato" } },
        {
          onSuccess: () =>
            queryClient.invalidateQueries({
              queryKey: getListReviewItemsQueryKey(current.item.materialId, activeName),
            }),
        },
      );
    }
    setRevealed(false);
    if (index + 1 >= cards.length) setFinished(true);
    else setIndex(index + 1);
  }

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-10">
          <Skeleton className="h-72 w-full" />
        </div>
      </StudentLayout>
    );
  }

  if (!cards.length) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16 text-center p-12 border rounded-lg bg-card border-dashed">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Niente da ripassare al volo</h3>
          <p className="text-muted-foreground mb-4">Il tuo piano di ripasso e' vuoto: svolgi un quiz per alimentarlo.</p>
          <Button asChild variant="outline">
            <Link href="/studio/ripasso">Vai al piano di ripasso</Link>
          </Button>
        </div>
      </StudentLayout>
    );
  }

  if (finished) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16">
          <Card className="border-secondary/30 bg-secondary/5">
            <CardContent className="p-10 text-center space-y-4">
              <PartyPopper className="mx-auto h-12 w-12 text-secondary" />
              <h2 className="text-2xl font-bold text-secondary">Ripasso lampo completato!</h2>
              <p className="text-muted-foreground">
                {knownCount} su {cards.length} argomenti gia' consolidati. {knownCount < cards.length ? "Gli altri restano nel piano: ci torneremo." : "Grande!"}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Button asChild variant="outline">
                  <Link href="/studio/ripasso">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Piano di ripasso
                  </Link>
                </Button>
                <Button asChild className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                  <Link href="/studio">Torna ai materiali</Link>
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
      <div className="max-w-xl mx-auto space-y-6 mt-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2 text-secondary">
              <Zap className="h-5 w-5" />
              Ripasso lampo
            </h1>
            <span className="text-sm text-muted-foreground">
              {index + 1} / {cards.length}
            </span>
          </div>
          <Progress value={((index) / cards.length) * 100} />
        </div>

        <Card>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Badge variant="secondary">{current.item.topic}</Badge>
                <Badge variant="outline">{current.item.materialTitle}</Badge>
              </div>
              <p className="text-lg font-medium leading-relaxed">
                {current.question ? current.question.question : `Ripassa a voce alta: ${current.item.topic}. Cosa ricordi?`}
              </p>
            </div>

            {!revealed ? (
              <Button variant="outline" className="w-full" onClick={() => setRevealed(true)}>
                <Eye className="mr-2 h-4 w-4" />
                Mostra la risposta
              </Button>
            ) : (
              <>
                {current.question && (
                  <div className="rounded-lg bg-muted/50 border p-4 text-[15px] leading-relaxed">{current.question.answer}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => next(false)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Da ripassare
                  </Button>
                  <Button className="bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={() => next(true)}>
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    La sapevo!
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Prima prova a rispondere a voce alta o a mente: e' il richiamo attivo che fissa il ricordo.
        </p>
      </div>
    </StudentLayout>
  );
}
