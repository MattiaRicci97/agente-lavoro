import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PiggyBank, CheckCircle2, Clock, Lock } from "lucide-react";

interface LessonSummary {
  id: number;
  ord: number;
  title: string;
  minutes: number;
  completed: boolean;
  quizScore: number | null;
  quizTotal: number | null;
}
interface LessonsResponse {
  moduleKey: string;
  active: boolean;
  lessons: LessonSummary[];
}

export default function StudioFinEd() {
  const { data, isLoading } = useQuery({
    queryKey: ["finEdLessons"],
    queryFn: () => customFetch<LessonsResponse>("/api/modules/ed-finanziaria/lessons", { responseType: "json" }),
  });

  const lessons = data?.lessons ?? [];
  const completedCount = lessons.filter((l) => l.completed).length;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-secondary flex items-center gap-3">
            <PiggyBank className="h-8 w-8" />
            Educazione Finanziaria
          </h1>
          <p className="text-muted-foreground">
            Il percorso per capire soldi, risparmio e investimenti — previsto dalla Legge 21/2024.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !data?.active ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <Lock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Modulo non attivo</h3>
            <p className="text-muted-foreground">
              Il tuo istituto non ha ancora attivato il modulo di Educazione Finanziaria. Chiedi al tuo docente!
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card p-5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Il tuo avanzamento</span>
                <span className="text-muted-foreground">
                  {completedCount} / {lessons.length} lezioni
                </span>
              </div>
              <Progress value={lessons.length ? (completedCount / lessons.length) * 100 : 0} />
            </div>

            <div className="space-y-4">
              {lessons.map((lesson) => (
                <Card key={lesson.id} className={lesson.completed ? "border-green-200" : ""}>
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 ${
                          lesson.completed ? "bg-green-100 text-green-700" : "bg-secondary/15 text-secondary"
                        }`}
                      >
                        {lesson.completed ? <CheckCircle2 className="h-5 w-5" /> : lesson.ord}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{lesson.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {lesson.minutes} min di lettura
                          {lesson.completed && lesson.quizTotal ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Quiz: {lesson.quizScore}/{lesson.quizTotal}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Button asChild variant={lesson.completed ? "outline" : "default"} className={lesson.completed ? "" : "bg-secondary hover:bg-secondary/90 text-secondary-foreground"}>
                      <Link href={`/studio/finanza/${lesson.id}`}>{lesson.completed ? "Rivedi" : "Inizia"}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </StudentLayout>
  );
}
