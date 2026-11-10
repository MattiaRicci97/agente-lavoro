import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Eye, ThumbsUp, RotateCcw, PartyPopper, Target } from "lucide-react";

export interface RecoveryDue {
  id: number;
  round: number;
  dueDate: string;
  objectiveId: number;
  objectiveTitle: string;
  question: string;
  answer: string;
}

/**
 * I richiami del recupero approvato dal docente: una domanda per obiettivo,
 * lo studente prova, guarda la risposta e dice com'e' andata. E' pratica:
 * serve a lui, non produce voti.
 */
export function RecoveryLampo({ due, onDone }: { due: RecoveryDue[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [cards] = useState(due);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(0);
  const [finished, setFinished] = useState(false);

  const complete = useMutation({
    mutationFn: ({ id, knewIt }: { id: number; knewIt: boolean }) =>
      customFetch(`/api/recovery-items/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knewIt }),
        responseType: "json",
      }),
  });

  const current = cards[index];

  async function next(knewIt: boolean) {
    if (!current) return;
    await complete.mutateAsync({ id: current.id, knewIt }).catch(() => undefined);
    if (knewIt) setKnown((k) => k + 1);
    setRevealed(false);
    if (index + 1 >= cards.length) {
      setFinished(true);
      void queryClient.invalidateQueries({ queryKey: ["myRecovery"] });
      void queryClient.invalidateQueries({ queryKey: ["myMastery"] });
    } else setIndex(index + 1);
  }

  if (finished) {
    return (
      <div className="max-w-xl mx-auto mt-16">
        <Card className="border-secondary/30 bg-secondary/5">
          <CardContent className="p-10 text-center space-y-4">
            <PartyPopper className="mx-auto h-12 w-12 text-secondary" />
            <h2 className="text-2xl font-bold text-secondary">Richiami di oggi completati</h2>
            <p className="text-muted-foreground">
              {known} su {cards.length} ti sono tornati subito.{" "}
              {known < cards.length ? "Gli altri li rivedrai al prossimo giro: e' cosi' che si fissano." : "Ottimo lavoro."}
            </p>
            <Button onClick={onDone}>Continua</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-6 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <Target className="h-4 w-4" /> Ripasso mirato dal tuo docente
          </span>
          <span className="text-muted-foreground">
            {index + 1} di {cards.length}
          </span>
        </div>
        <Progress value={(index / cards.length) * 100} />
      </div>

      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{current.objectiveTitle}</Badge>
            <span className="text-xs text-muted-foreground">richiamo {current.round}</span>
          </div>
          <p className="text-xl font-medium leading-relaxed whitespace-pre-wrap">{current.question}</p>

          {revealed ? (
            <>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risposta</div>
                <p className="whitespace-pre-wrap leading-relaxed">{current.answer}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => next(false)} disabled={complete.isPending}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Da rivedere
                </Button>
                <Button onClick={() => next(true)} disabled={complete.isPending}>
                  <ThumbsUp className="mr-2 h-4 w-4" /> Lo sapevo
                </Button>
              </div>
            </>
          ) : (
            <Button className="w-full" onClick={() => setRevealed(true)}>
              <Eye className="mr-2 h-4 w-4" /> Prova a rispondere, poi mostra la risposta
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
