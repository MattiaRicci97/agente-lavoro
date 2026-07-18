import { useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetMaterial, getGetMaterialQueryKey, useGetMe, customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QuizSetQuestion {
  id: number;
  question: string;
  topic: string;
  difficulty: string;
}
interface QuizSet {
  questions: QuizSetQuestion[];
  focusTopics: string[];
  level: "facile" | "medio" | "difficile";
}

const LEVEL_LABELS: Record<QuizSet["level"], string> = {
  facile: "Consolidamento — ripartiamo dalle basi",
  medio: "Livello standard",
  difficile: "Livello sfida — stai andando forte",
};

export default function StudioQuiz() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isStarted, setIsStarted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  const { data: me } = useGetMe();
  const studentName = me?.studentMemberships?.[0]?.name ?? "";

  const { data: material, isLoading: materialLoading } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });

  const { data: quizSet, isLoading: quizSetLoading } = useQuery({
    queryKey: ["quizSet", materialId],
    queryFn: () => customFetch<QuizSet>(`/api/materials/${materialId}/quiz-set`, { responseType: "json" }),
    enabled: !!materialId,
  });

  const questions = quizSet?.questions ?? [];

  const handleStart = () => {
    startedAtRef.current = Date.now();
    setIsStarted(true);
  };

  const handleSubmit = async () => {
    if (!questions.length) return;
    setSubmitting(true);

    const durationSeconds = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : undefined;

    try {
      const data = await customFetch<any>(`/api/materials/${materialId}/quiz-attempts`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          studentName,
          answers: questions.map((q) => ({ questionId: q.id, answerText: answers[q.id] || "" })),
          durationSeconds,
        }),
      });
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast({ title: "Errore", description: "Impossibile valutare il quiz.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (materialLoading || quizSetLoading) {
    return (
      <StudentLayout>
        <Skeleton className="h-64 w-full" />
      </StudentLayout>
    );
  }

  if (!material || !questions.length) {
    return (
      <StudentLayout>
        <div className="text-center p-12">Nessun quiz disponibile per questo materiale.</div>
      </StudentLayout>
    );
  }

  if (result) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto space-y-8">
          <Button variant="ghost" asChild className="mb-4 -ml-4">
            <Link href="/studio">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna ai materiali
            </Link>
          </Button>

          <Card className="border-secondary/20 bg-secondary/5">
            <CardContent className="p-8 text-center">
              <h2 className="text-3xl font-bold text-secondary mb-2">Quiz Completato!</h2>
              <p className="text-muted-foreground text-lg mb-6">
                Punteggio ottenuto: {result.score} / {result.total}
              </p>
              <div className="text-6xl font-bold text-secondary">{Math.round((result.score / result.total) * 100)}%</div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <h3 className="text-xl font-bold">Correzione Dettagliata</h3>
            {result.gradedAnswers.map((ans: any, i: number) => (
              <Card key={i} className={ans.correct ? "border-green-200" : "border-destructive/30"}>
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    <div className="mt-1">
                      {ans.correct ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      ) : (
                        <XCircle className="h-6 w-6 text-destructive" />
                      )}
                    </div>
                    <div className="space-y-4 w-full">
                      <div>
                        <p className="font-medium text-lg">{ans.question}</p>
                        <p className="text-sm text-muted-foreground mt-1">Argomento: {ans.topic}</p>
                      </div>

                      <div className="bg-muted p-4 rounded-md">
                        <span className="text-xs font-semibold uppercase text-muted-foreground block mb-1">La tua risposta:</span>
                        {ans.answerText || <span className="italic text-muted-foreground">Nessuna risposta</span>}
                      </div>

                      <div className={`p-4 rounded-md ${ans.correct ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
                        <span className="text-xs font-semibold uppercase block mb-1">Feedback AI:</span>
                        {ans.feedback}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!isStarted) {
    return (
      <StudentLayout>
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-secondary">Quiz: {material.title}</h1>
                <p className="text-muted-foreground">{questions.length} domande a risposta aperta, scelte per te.</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Target className="h-4 w-4 text-secondary" />
                  {LEVEL_LABELS[quizSet?.level ?? "medio"]}
                </div>
                {!!quizSet?.focusTopics?.length && (
                  <p className="text-muted-foreground">
                    Oggi insistiamo su: <span className="font-medium text-foreground">{quizSet.focusTopics.join(", ")}</span>
                  </p>
                )}
              </div>

              <Button
                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                size="lg"
                onClick={handleStart}
                disabled={!studentName}
              >
                {studentName ? "Inizia Esercitazione" : "Caricamento..."}
              </Button>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-8 pb-20">
        <div className="flex justify-between items-end border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold">{material.title}</h1>
            <p className="text-muted-foreground">Esercitazione a richiamo attivo</p>
          </div>
          <div className="text-sm font-medium bg-secondary/10 text-secondary px-3 py-1 rounded-full">
            {questions.length} Domande
          </div>
        </div>

        <div className="space-y-8">
          {questions.map((q, i) => (
            <div key={q.id} className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-secondary/20 text-secondary rounded-full flex items-center justify-center font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-lg leading-relaxed">{q.question}</Label>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="text-[10px]">{q.topic}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{q.difficulty}</Badge>
                    </div>
                  </div>
                  <Textarea
                    placeholder="Scrivi la tua risposta qui..."
                    className="min-h-[120px] text-base p-4"
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-8 border-t">
          <Button
            size="lg"
            className="px-8 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Valutazione in corso...
              </>
            ) : (
              "Consegna Quiz"
            )}
          </Button>
        </div>
      </div>
    </StudentLayout>
  );
}
