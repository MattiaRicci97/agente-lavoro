import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetMaterial, getGetMaterialQueryKey, customFetch } from "@sillabo/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, FileText, CalendarClock, Hourglass, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const examTypeLabels: Record<string, string> = {
  tema: "Tema",
  versione: "Versione",
  problema: "Problema",
};

interface MySubmission {
  id: number;
  answer: string;
  status: "da_validare" | "validata";
  grade: number | null;
  feedback: string | null;
  createdAt: string;
}

interface Assignment {
  id: number;
  materialId: number;
  examType: string;
  prompt: string;
  dueDate: string | null;
  instructions: string | null;
  createdAt: string;
  mySubmission: MySubmission | null;
}

function formatDue(due: string) {
  return new Date(`${due}T00:00:00`).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Esito della consegna: in attesa del docente, oppure valutato da lui. */
function SubmissionOutcome({ submission }: { submission: MySubmission }) {
  if (submission.status !== "validata") {
    return (
      <Card className="border-amber-300/60 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 p-6">
          <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h3 className="font-medium text-amber-900">Consegnato, in attesa del tuo docente</h3>
            <p className="mt-1 text-sm text-amber-800">
              Il compito è arrivato. Il voto lo dà il docente: appena lo corregge lo trovi qui.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-secondary/20 bg-secondary/5">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-secondary">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="font-display text-2xl font-semibold">Corretto dal tuo docente</h2>
          </div>
          {submission.grade !== null && (
            <div className="mt-4 text-6xl font-bold text-secondary">{submission.grade}/10</div>
          )}
        </CardContent>
      </Card>
      {submission.feedback && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Il commento del docente</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {submission.feedback}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function StudioScritto() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");

  const { data: material, isLoading: materialLoading } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });

  const assignmentsKey = ["writtenAssignments", materialId];
  const { data: assignments, isLoading: examsLoading } = useQuery({
    queryKey: assignmentsKey,
    enabled: !!materialId,
    queryFn: () =>
      customFetch<Assignment[]>(`/api/materials/${materialId}/written-exams`, { responseType: "json" }),
  });

  const submit = useMutation({
    mutationFn: (examId: number) =>
      customFetch(`/api/written-exams/${examId}/submit`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ studentAnswer: answer }),
      }),
    onSuccess: () => {
      setAnswer("");
      queryClient.invalidateQueries({ queryKey: assignmentsKey });
      toast({
        title: "Compito consegnato",
        description: "Ora tocca al tuo docente: riceverai il voto quando lo avrà corretto.",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Consegna non riuscita",
        description: err?.data?.error ?? "Riprova tra un momento.",
        variant: "destructive",
      }),
  });

  if (materialLoading || examsLoading) {
    return (
      <StudentLayout>
        <Skeleton className="h-64 w-full" />
      </StudentLayout>
    );
  }

  if (!material) return null;

  const list = assignments ?? [];
  const selected = list.find((a) => a.id === selectedExamId) ?? null;

  return (
    <StudentLayout>
      <div className="mx-auto max-w-3xl space-y-8 pb-20">
        <Button variant="ghost" asChild className="-ml-4 mb-2">
          <Link href="/studio">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna ai materiali
          </Link>
        </Button>

        <div>
          <h1 className="font-display text-2xl font-semibold">{material.title}</h1>
          <p className="text-muted-foreground">Compiti assegnati dal tuo docente</p>
        </div>

        {!selected ? (
          <div className="space-y-4">
            {!list.length ? (
              <div className="rounded-lg border border-dashed bg-card p-12 text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="text-lg font-medium">Nessun compito assegnato</h3>
                <p className="text-muted-foreground">
                  Il tuo docente non ha ancora assegnato compiti su questo materiale.
                </p>
              </div>
            ) : (
              list.map((a) => (
                <Card
                  key={a.id}
                  className="hover-elevate cursor-pointer transition-colors hover:border-secondary/50"
                  onClick={() => setSelectedExamId(a.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {examTypeLabels[a.examType] ?? a.examType}
                      </Badge>
                      {a.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          entro {formatDue(a.dueDate)}
                        </span>
                      )}
                      {a.mySubmission && (
                        <Badge
                          className={
                            a.mySubmission.status === "validata"
                              ? "ml-auto bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              : "ml-auto bg-amber-100 text-amber-800 hover:bg-amber-100"
                          }
                        >
                          {a.mySubmission.status === "validata" ? "Corretto" : "Consegnato"}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{a.prompt}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="uppercase text-[10px]">
                    {examTypeLabels[selected.examType] ?? selected.examType}
                  </Badge>
                  {selected.dueDate && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      entro {formatDue(selected.dueDate)}
                    </span>
                  )}
                </div>
                <CardTitle className="text-lg font-normal leading-relaxed">{selected.prompt}</CardTitle>
              </CardHeader>
              {selected.instructions && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Nota del docente:</span>{" "}
                  {selected.instructions}
                </CardContent>
              )}
            </Card>

            {selected.mySubmission ? (
              <>
                <SubmissionOutcome submission={selected.mySubmission} />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quello che hai consegnato</CardTitle>
                  </CardHeader>
                  <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {selected.mySubmission.answer}
                  </CardContent>
                </Card>
                <Button variant="outline" onClick={() => setSelectedExamId(null)}>
                  Torna ai compiti
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Scrivi qui il tuo svolgimento..."
                    className="min-h-[400px] p-4 text-base"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si consegna una volta sola: rileggi prima di inviare.
                  </p>
                </div>

                <div className="flex justify-between border-t pt-4">
                  <Button variant="ghost" onClick={() => setSelectedExamId(null)}>
                    Annulla
                  </Button>
                  <Button
                    size="lg"
                    className="bg-secondary px-8 text-secondary-foreground hover:bg-secondary/90"
                    onClick={() => {
                      if (!answer.trim()) {
                        toast({
                          title: "Attenzione",
                          description: "Scrivi il tuo elaborato prima di consegnare.",
                          variant: "destructive",
                        });
                        return;
                      }
                      submit.mutate(selected.id);
                    }}
                    disabled={submit.isPending}
                  >
                    {submit.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consegna in corso...
                      </>
                    ) : (
                      "Consegna il compito"
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
