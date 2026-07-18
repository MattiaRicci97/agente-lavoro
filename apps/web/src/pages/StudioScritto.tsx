import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetMaterial,
  getGetMaterialQueryKey,
  useListWrittenExams,
  getListWrittenExamsQueryKey,
  useSubmitWrittenExam,
} from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSavedStudentName, saveStudentName } from "@/lib/studentName";

const examTypeLabels: Record<string, string> = {
  tema: "Tema",
  versione: "Versione",
  problema: "Problema",
};

export default function StudioScritto() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [studentName, setStudentName] = useState(getSavedStudentName());
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");

  const { data: material, isLoading: materialLoading } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });

  const { data: exams, isLoading: examsLoading } = useListWrittenExams(materialId, {
    query: { enabled: !!materialId, queryKey: getListWrittenExamsQueryKey(materialId) },
  });

  const submitExam = useSubmitWrittenExam();

  const availableExams = (exams || []).filter((e) => e.status === "da_svolgere");
  const selectedExam = (exams || []).find((e) => e.id === selectedExamId);

  const handleSubmit = () => {
    if (!selectedExamId) return;
    if (!studentName.trim()) {
      toast({ title: "Attenzione", description: "Inserisci il tuo nome.", variant: "destructive" });
      return;
    }
    if (!answer.trim()) {
      toast({ title: "Attenzione", description: "Scrivi il tuo elaborato prima di consegnare.", variant: "destructive" });
      return;
    }
    saveStudentName(studentName);
    submitExam.mutate(
      { id: selectedExamId, data: { studentName, studentAnswer: answer } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWrittenExamsQueryKey(materialId) });
          toast({ title: "Elaborato consegnato", description: "L'AI ha corretto il tuo lavoro." });
        },
        onError: () => {
          toast({ title: "Errore", description: "Impossibile correggere l'elaborato.", variant: "destructive" });
        },
      }
    );
  };

  if (materialLoading || examsLoading) {
    return (
      <StudentLayout>
        <Skeleton className="h-64 w-full" />
      </StudentLayout>
    );
  }

  if (!material) return null;

  const gradedExam = selectedExam?.status === "corretta" ? selectedExam : null;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-8 pb-20">
        <Button variant="ghost" asChild className="mb-2 -ml-4">
          <Link href="/studio">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna ai materiali
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">{material.title}</h1>
          <p className="text-muted-foreground">Verifica scritta in formato reale</p>
        </div>

        {!selectedExamId ? (
          <div className="space-y-4">
            {!availableExams.length ? (
              <div className="text-center p-12 border rounded-lg bg-card border-dashed">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Nessuna verifica disponibile</h3>
                <p className="text-muted-foreground">Il docente non ha ancora generato una verifica scritta per questo materiale.</p>
              </div>
            ) : (
              availableExams.map((exam) => (
                <Card key={exam.id} className="hover:border-secondary/50 transition-colors cursor-pointer" onClick={() => setSelectedExamId(exam.id)}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        <Badge variant="outline" className="mr-2 uppercase text-[10px]">{examTypeLabels[exam.examType]}</Badge>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm line-clamp-3 text-muted-foreground">{exam.prompt}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : gradedExam ? (
          <div className="space-y-6">
            <Card className="border-secondary/20 bg-secondary/5">
              <CardContent className="p-8 text-center">
                <h2 className="text-3xl font-bold text-secondary mb-2">Elaborato corretto!</h2>
                <div className="text-6xl font-bold text-secondary mt-4">{gradedExam.grade}/10</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Feedback dell'AI</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{gradedExam.feedback}</CardContent>
            </Card>
            <Button variant="outline" onClick={() => { setSelectedExamId(null); setAnswer(""); }}>
              Torna alle verifiche
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Badge variant="outline" className="w-fit uppercase text-[10px] mb-2">{examTypeLabels[selectedExam!.examType]}</Badge>
                <CardTitle className="text-lg leading-relaxed font-normal">{selectedExam!.prompt}</CardTitle>
              </CardHeader>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="studentName">Il tuo nome</Label>
              <Input
                id="studentName"
                placeholder="Mario Rossi"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Il tuo elaborato</Label>
              <Textarea
                placeholder="Scrivi qui il tuo svolgimento..."
                className="min-h-[400px] text-base p-4"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="ghost" onClick={() => setSelectedExamId(null)}>Annulla</Button>
              <Button
                size="lg"
                className="px-8 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                onClick={handleSubmit}
                disabled={submitExam.isPending}
              >
                {submitExam.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Correzione in corso...</>
                ) : "Consegna elaborato"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
