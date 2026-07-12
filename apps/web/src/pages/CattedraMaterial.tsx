import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetMaterial,
  getGetMaterialQueryKey,
  useGetMaterialAnalytics,
  useGenerateQuestions,
  useListQuestions,
  getListQuestionsQueryKey,
  getListMaterialsQueryKey,
  useListWrittenExams,
  getListWrittenExamsQueryKey,
  useGenerateWrittenExam,
  useSimplifyMaterial,
  customFetch,
} from "@sillabo/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ArrowLeft, BrainCircuit, AlertTriangle, CheckCircle2, XCircle, Loader2, FileText, HeartHandshake, Printer, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CurriculumBadge } from "@/components/CurriculumBadge";

const examTypeLabels: Record<string, string> = {
  tema: "Tema",
  versione: "Versione",
  problema: "Problema",
};

interface PrintableExam {
  prompt: string;
  title: string;
  subject: string;
  gradeLevel: string;
  examType: string;
}

/**
 * Vista stampabile a schermo intero: il docente usa "Stampa" del browser
 * per portarla su carta o salvarla come PDF.
 */
function PrintableExamView({ exam, onClose }: { exam: PrintableExam; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white text-black overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8 print:p-0">
        <div className="flex justify-between items-center mb-6 print:hidden">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Stampa / Salva PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Chiudi
          </Button>
        </div>

        <div className="space-y-6">
          <div className="border-b-2 border-black pb-4 space-y-1">
            <div className="text-sm uppercase tracking-widest">{examTypeLabels[exam.examType] ?? exam.examType} — {exam.subject}</div>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <div className="text-sm">{exam.gradeLevel}</div>
            <div className="flex gap-12 pt-4 text-sm">
              <span>Nome e cognome: ______________________________</span>
              <span>Data: ______________</span>
            </div>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{exam.prompt}</div>
          <div className="pt-8 text-xs text-neutral-500 print:text-neutral-500">Generata con Sillabo — il sistema operativo della didattica</div>
        </div>
      </div>
    </div>
  );
}

export default function CattedraMaterial() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: material, isLoading: materialLoading } = useGetMaterial(materialId, { 
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) } 
  });
  
  const { data: analytics, isLoading: analyticsLoading } = useGetMaterialAnalytics(materialId, {
    query: { enabled: !!materialId, queryKey: ["analytics", materialId] }
  });

  const { data: questions, isLoading: questionsLoading } = useListQuestions(materialId, {
    query: { enabled: !!materialId, queryKey: getListQuestionsQueryKey(materialId) }
  });

  const generateQuestions = useGenerateQuestions();

  const { data: writtenExams, isLoading: writtenExamsLoading } = useListWrittenExams(materialId, {
    query: { enabled: !!materialId, queryKey: getListWrittenExamsQueryKey(materialId) }
  });

  const generateWrittenExam = useGenerateWrittenExam();
  const simplifyMaterial = useSimplifyMaterial();

  const [printableExam, setPrintableExam] = useState<PrintableExam | null>(null);
  const generatePrintable = useMutation({
    mutationFn: (examType: "tema" | "versione" | "problema") =>
      customFetch<PrintableExam>(`/api/materials/${materialId}/printable-exam`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ examType }),
      }),
    onSuccess: (data) => setPrintableExam(data),
    onError: (err: any) =>
      toast({ title: "Errore", description: err?.data?.error ?? "Impossibile generare la verifica.", variant: "destructive" }),
  });

  const handleGenerateQuestions = () => {
    generateQuestions.mutate({ id: materialId }, {
      onSuccess: () => {
        toast({
          title: "Domande generate",
          description: "L'AI ha elaborato il materiale e creato le domande di verifica.",
        });
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey(materialId) });
        queryClient.invalidateQueries({ queryKey: getGetMaterialQueryKey(materialId) });
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
      },
      onError: () => {
        toast({
          title: "Errore",
          description: "Impossibile generare le domande. Riprova più tardi.",
          variant: "destructive",
        });
      }
    });
  };

  const handleGenerateWrittenExam = (examType: "tema" | "versione" | "problema") => {
    generateWrittenExam.mutate({ id: materialId, data: { examType } }, {
      onSuccess: () => {
        toast({ title: "Verifica generata", description: `${examTypeLabels[examType]} pronto per gli studenti.` });
        queryClient.invalidateQueries({ queryKey: getListWrittenExamsQueryKey(materialId) });
      },
      onError: () => {
        toast({ title: "Errore", description: "Impossibile generare la verifica.", variant: "destructive" });
      }
    });
  };

  const handleSimplify = () => {
    simplifyMaterial.mutate({ id: materialId }, {
      onSuccess: () => {
        toast({ title: "Versione semplificata generata", description: "Ora disponibile per studenti con BES/DSA." });
        queryClient.invalidateQueries({ queryKey: getGetMaterialQueryKey(materialId) });
      },
      onError: () => {
        toast({ title: "Errore", description: "Impossibile generare la versione semplificata.", variant: "destructive" });
      }
    });
  };

  if (materialLoading) {
    return (
      <TeacherLayout>
        <div className="p-8 max-w-6xl mx-auto space-y-8">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </TeacherLayout>
    );
  }

  if (!material) return null;

  return (
    <TeacherLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <Button variant="ghost" asChild className="mb-4 -ml-4 text-muted-foreground">
            <Link href="/cattedra">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla dashboard
            </Link>
          </Button>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">{material.title}</h1>
              <p className="text-muted-foreground mt-1">{material.subject} • {material.gradeLevel}</p>
              <CurriculumBadge topic={material.curriculumTopic} subtopic={material.curriculumSubtopic} />
            </div>
            {!material.questionCount && (
              <Button onClick={handleGenerateQuestions} disabled={generateQuestions.isPending}>
                {generateQuestions.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BrainCircuit className="mr-2 h-4 w-4" />
                )}
                Genera Domande AI
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Analytics Classe</CardTitle>
                <CardDescription>Andamento degli studenti su questo argomento</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-32" /> : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">{analytics?.studentsCount || 0}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Studenti</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">{analytics?.quizAttemptsCount || 0}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Esercitazioni</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">{analytics?.averageQuizScorePercent || 0}%</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Media Quiz</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">{analytics?.averageOralGrade || "-"}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Media Orale</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mappa delle Lacune</CardTitle>
                <CardDescription>Argomenti dove gli studenti hanno più difficoltà</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-32" /> : !analytics?.topicGaps.length ? (
                  <div className="text-center p-6 text-muted-foreground text-sm">Dati insufficienti</div>
                ) : (
                  <div className="space-y-4">
                    {analytics.topicGaps.map((gap, i) => (
                      <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{gap.topic}</div>
                          <div className="text-xs text-muted-foreground">{gap.attemptsCount} tentativi</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">{gap.accuracyRate}% corretti</div>
                          {gap.accuracyRate < 60 ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Studenti a rischio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-16" /> : !analytics?.atRiskStudents.length ? (
                  <div className="text-sm text-muted-foreground">Nessuno studente a rischio rilevato.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {analytics.atRiskStudents.map((name, i) => (
                      <span key={i} className="px-2 py-1 bg-destructive/10 text-destructive text-xs font-medium rounded-md">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Domande Generate ({material.questionCount})</CardTitle>
              </CardHeader>
              <CardContent>
                {questionsLoading ? <Skeleton className="h-32" /> : !questions?.length ? (
                   <div className="text-sm text-muted-foreground">Nessuna domanda generata.</div>
                ) : (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {questions.map((q) => (
                      <div key={q.id} className="text-sm border-b pb-3 last:border-0 last:pb-0">
                        <div className="font-medium mb-1">{q.question}</div>
                        <div className="text-muted-foreground text-xs line-clamp-2">{q.answer}</div>
                        <div className="flex gap-2 mt-2">
                           <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] uppercase">{q.difficulty}</span>
                           <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] uppercase truncate">{q.topic}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Verifiche scritte
                </CardTitle>
                <CardDescription>Genera verifiche in formato reale (tema, versione, problema)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {(["tema", "versione", "problema"] as const).map((type) => (
                    <Button
                      key={type}
                      size="sm"
                      variant="outline"
                      onClick={() => handleGenerateWrittenExam(type)}
                      disabled={generateWrittenExam.isPending}
                    >
                      {generateWrittenExam.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : examTypeLabels[type]}
                    </Button>
                  ))}
                </div>
                <div className="rounded-md border border-dashed p-3 space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Printer className="h-3.5 w-3.5" />
                    Versione cartacea: genera e stampa (o salva in PDF) per usarla in classe.
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["tema", "versione", "problema"] as const).map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant="secondary"
                        onClick={() => generatePrintable.mutate(type)}
                        disabled={generatePrintable.isPending}
                      >
                        {generatePrintable.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : examTypeLabels[type]}
                      </Button>
                    ))}
                  </div>
                </div>
                {writtenExamsLoading ? <Skeleton className="h-16" /> : !writtenExams?.length ? (
                  <div className="text-sm text-muted-foreground">Nessuna verifica generata.</div>
                ) : (
                  <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                    {writtenExams.map((exam) => (
                      <div key={exam.id} className="text-sm border-b pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="uppercase text-[10px]">{examTypeLabels[exam.examType]}</Badge>
                          {exam.status === "corretta" ? (
                            <span className="text-xs font-semibold text-secondary">{exam.studentName}: {exam.grade}/10</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Da svolgere</span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs line-clamp-2">{exam.prompt}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <HeartHandshake className="h-4 w-4" />
                  Inclusione BES/DSA
                </CardTitle>
                <CardDescription>Versione semplificata generata dall'AI per studenti con bisogni educativi speciali</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {material.simplifiedContent ? (
                  <div className="text-sm bg-muted/50 rounded-md p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {material.simplifiedContent}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Nessuna versione semplificata generata.</div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleSimplify}
                  disabled={simplifyMaterial.isPending}
                >
                  {simplifyMaterial.isPending ? (
                    <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Generazione...</>
                  ) : material.simplifiedContent ? "Rigenera versione semplificata" : "Genera versione semplificata"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {printableExam && <PrintableExamView exam={printableExam} onClose={() => setPrintableExam(null)} />}
    </TeacherLayout>
  );
}
