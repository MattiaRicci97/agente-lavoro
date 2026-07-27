import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { ProtectedImage } from "@/components/ProtectedImage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ScanLine, Mic, Sparkles, Stamp, PartyPopper } from "lucide-react";

interface PendingPhoto {
  id: number;
  studentName: string;
  className: string;
  subject: string;
  assignmentPrompt: string | null;
  imageObjectPath: string;
  transcription: string;
  grade: number | null;
  feedback: string;
  strengths: string[];
  improvements: string[];
  createdAt: string;
}

interface PendingOral {
  id: number;
  materialId: number;
  studentName: string;
  grade: number | null;
  feedback: string | null;
  materialTitle: string;
  subject: string;
  createdAt: string;
}

interface PendingResponse {
  photoCorrections: PendingPhoto[];
  oralSessions: PendingOral[];
  total: number;
}

/** Riquadro di firma: il docente conferma o modifica la proposta dell'AI. */
function SignBox({
  proposedGrade,
  proposedFeedback,
  onSign,
  isPending,
}: {
  proposedGrade: number | null;
  proposedFeedback: string;
  onSign: (grade: number | null, feedback: string) => void;
  isPending: boolean;
}) {
  const [grade, setGrade] = useState<string>(proposedGrade !== null ? String(proposedGrade) : "");
  const [feedback, setFeedback] = useState<string>(proposedFeedback);
  const touched = grade !== (proposedGrade !== null ? String(proposedGrade) : "") || feedback !== proposedFeedback;

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Stamp className="h-4 w-4" />
        La tua valutazione
        {touched && <Badge variant="outline" className="ml-auto text-[10px]">modificata</Badge>}
      </div>

      <div className="flex gap-3">
        <div className="w-24 space-y-1.5">
          <Label className="text-xs">Voto /10</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Commento per lo studente</Label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[80px] resize-none bg-card"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Puoi confermare così com'è o correggere: allo studente arriva la <strong>tua</strong> versione.
        </p>
        <Button
          onClick={() => onSign(grade.trim() === "" ? null : Number(grade), feedback)}
          disabled={isPending}
          className="shrink-0"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {touched ? "Correggi e firma" : "Conferma e firma"}
        </Button>
      </div>
    </div>
  );
}

export default function CattedraValidazioni() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["validationsPending"],
    queryFn: () => customFetch<PendingResponse>("/api/validations/pending", { responseType: "json" }),
  });

  const sign = useMutation({
    mutationFn: ({
      kind,
      id,
      grade,
      feedback,
    }: {
      kind: "photo" | "oral";
      id: number;
      grade: number | null;
      feedback: string;
    }) =>
      customFetch(
        kind === "photo" ? `/api/photo-corrections/${id}/validate` : `/api/oral-sessions/${id}/validate`,
        { method: "POST", responseType: "json", body: JSON.stringify({ grade, feedback }) },
      ),
    onSuccess: () => {
      toast({ title: "Valutazione firmata", description: "Lo studente vede ora la tua valutazione." });
      queryClient.invalidateQueries({ queryKey: ["validationsPending"] });
    },
    onError: (err: any) =>
      toast({
        title: "Errore",
        description: err?.data?.error ?? "Impossibile salvare la valutazione.",
        variant: "destructive",
      }),
  });

  const photos = data?.photoCorrections ?? [];
  const orals = data?.oralSessions ?? [];

  return (
    <TeacherLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Da validare</h1>
          <p className="text-muted-foreground mt-1">
            L'assistente prepara una proposta di valutazione. Nessun voto arriva allo studente senza il tuo visto.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : photos.length === 0 && orals.length === 0 ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <PartyPopper className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Non c'è nulla in attesa</h3>
            <p className="text-muted-foreground">
              Quando i tuoi studenti svolgono interrogazioni o inviano compiti, le proposte compaiono qui.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {photos.map((p) => (
              <Card key={`p-${p.id}`} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
                  <ScanLine className="h-4 w-4 text-secondary" />
                  <span className="font-medium">{p.studentName}</span>
                  <span className="text-sm text-muted-foreground">· {p.className} · {p.subject}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString("it-IT")}
                  </span>
                </div>
                <CardContent className="p-5 space-y-4">
                  {p.assignmentPrompt && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Consegna:</span> {p.assignmentPrompt}
                    </p>
                  )}

                  <ProtectedImage
                    objectPath={p.imageObjectPath}
                    alt={`Compito di ${p.studentName}`}
                    className="max-h-80 w-auto rounded-lg border mx-auto"
                  />

                  <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                      Proposta dell'assistente
                      {p.grade !== null && <Badge variant="outline" className="ml-auto">{p.grade}/10</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.feedback}</p>
                    {p.transcription && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">Trascrizione letta dall'AI</summary>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{p.transcription}</p>
                      </details>
                    )}
                  </div>

                  <SignBox
                    proposedGrade={p.grade}
                    proposedFeedback={p.feedback}
                    isPending={sign.isPending}
                    onSign={(grade, feedback) => sign.mutate({ kind: "photo", id: p.id, grade, feedback })}
                  />
                </CardContent>
              </Card>
            ))}

            {orals.map((o) => (
              <Card key={`o-${o.id}`} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
                  <Mic className="h-4 w-4 text-secondary" />
                  <span className="font-medium">{o.studentName}</span>
                  <span className="text-sm text-muted-foreground">· {o.materialTitle} · {o.subject}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("it-IT")}
                  </span>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                      Proposta dell'assistente
                      {o.grade !== null && <Badge variant="outline" className="ml-auto">{o.grade}/10</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{o.feedback ?? "—"}</p>
                  </div>

                  <SignBox
                    proposedGrade={o.grade}
                    proposedFeedback={o.feedback ?? ""}
                    isPending={sign.isPending}
                    onSign={(grade, feedback) => sign.mutate({ kind: "oral", id: o.id, grade, feedback })}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
