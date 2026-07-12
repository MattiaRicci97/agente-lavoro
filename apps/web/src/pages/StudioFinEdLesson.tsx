import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, PiggyBank } from "lucide-react";

interface LessonQuestion {
  id: number;
  question: string;
  options: string[];
}
interface LessonDetail {
  id: number;
  ord: number;
  title: string;
  content: string;
  minutes: number;
  questions: LessonQuestion[];
}
interface SubmitResult {
  score: number;
  total: number;
  graded: Array<{ questionId: number; correct: boolean; correctIndex: number; explanation: string }>;
}

/** Rendering markdown minimale (grassetti, corsivi, liste, paragrafi). */
function renderLessonContent(content: string) {
  const blocks = content.split(/\n\n+/);
  return blocks.map((block, i) => {
    const lines = block.split("\n");
    const isList = lines.every((l) => l.trim().startsWith("- "));
    const inline = (text: string) =>
      text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");

    if (isList) {
      return (
        <ul key={i} className="list-disc pl-6 space-y-1.5">
          {lines.map((l, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: inline(l.trim().slice(2)) }} />
          ))}
        </ul>
      );
    }
    return <p key={i} dangerouslySetInnerHTML={{ __html: inline(block) }} />;
  });
}

export default function StudioFinEdLesson() {
  const { id } = useParams();
  const lessonId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);

  const { data: lesson, isLoading, error } = useQuery({
    queryKey: ["finEdLesson", lessonId],
    queryFn: () => customFetch<LessonDetail>(`/api/module-lessons/${lessonId}`, { responseType: "json" }),
    enabled: !!lessonId,
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () =>
      customFetch<SubmitResult>(`/api/module-lessons/${lessonId}/submit`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, selectedIndex]) => ({
            questionId: Number(questionId),
            selectedIndex,
          })),
        }),
      }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["finEdLessons"] });
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    },
    onError: () => toast({ title: "Errore", description: "Impossibile inviare le risposte.", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-96 w-full" />
        </div>
      </StudentLayout>
    );
  }

  if (error || !lesson) {
    return (
      <StudentLayout>
        <div className="max-w-xl mx-auto mt-16 text-center p-12 border rounded-lg bg-card border-dashed">
          <h3 className="text-lg font-medium">Lezione non disponibile</h3>
          <p className="text-muted-foreground mb-4">
            {(error as any)?.data?.error ?? "Il modulo potrebbe non essere attivo per il tuo istituto."}
          </p>
          <Button asChild variant="outline">
            <Link href="/studio/finanza">Torna al percorso</Link>
          </Button>
        </div>
      </StudentLayout>
    );
  }

  const allAnswered = lesson.questions.length > 0 && lesson.questions.every((q) => answers[q.id] !== undefined);
  const gradedById = new Map(result?.graded.map((g) => [g.questionId, g]) ?? []);

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-8 pb-16">
        <div>
          <Button variant="ghost" asChild className="mb-4 -ml-4 text-muted-foreground">
            <Link href="/studio/finanza">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Percorso Educazione Finanziaria
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-secondary text-sm font-semibold uppercase tracking-wider">
            <PiggyBank className="h-4 w-4" />
            Lezione {lesson.ord}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{lesson.title}</h1>
        </div>

        <div className="space-y-4 text-[16px] leading-relaxed bg-card border rounded-xl p-6 sm:p-8">
          {renderLessonContent(lesson.content)}
        </div>

        {lesson.questions.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Verifica quello che hai imparato</h2>
            {lesson.questions.map((q, qi) => {
              const graded = gradedById.get(q.id);
              return (
                <Card key={q.id} className={graded ? (graded.correct ? "border-green-200" : "border-destructive/30") : ""}>
                  <CardContent className="p-6 space-y-3">
                    <p className="font-medium">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => {
                        const selected = answers[q.id] === oi;
                        let stateClasses = selected ? "border-secondary bg-secondary/10" : "hover:bg-muted/50";
                        if (graded) {
                          if (oi === graded.correctIndex) stateClasses = "border-green-400 bg-green-50";
                          else if (selected && !graded.correct) stateClasses = "border-destructive bg-red-50";
                          else stateClasses = "opacity-60";
                        }
                        return (
                          <button
                            key={oi}
                            type="button"
                            disabled={!!result}
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                            className={`w-full text-left border rounded-lg px-4 py-3 text-[15px] transition-colors ${stateClasses}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {graded && (
                      <div
                        className={`flex gap-2 items-start text-sm p-3 rounded-md ${
                          graded.correct ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"
                        }`}
                      >
                        {graded.correct ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        )}
                        {graded.explanation}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {!result ? (
              <div className="flex justify-end">
                <Button
                  size="lg"
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  onClick={() => submit.mutate()}
                  disabled={!allAnswered || submit.isPending}
                >
                  {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verifica le risposte
                </Button>
              </div>
            ) : (
              <Card className="border-secondary/30 bg-secondary/5">
                <CardContent className="p-6 text-center space-y-4">
                  <h3 className="text-xl font-bold text-secondary">
                    {result.score} su {result.total} corrette{result.score === result.total ? " — perfetto! 🎉" : ""}
                  </h3>
                  <p className="text-sm text-muted-foreground">Lezione completata: la ritrovi spuntata nel percorso.</p>
                  <Button onClick={() => setLocation("/studio/finanza")} variant="outline">
                    Torna al percorso
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
