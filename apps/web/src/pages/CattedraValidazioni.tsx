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
import { CheckCircle2, ScanLine, Mic, Sparkles, Stamp, PartyPopper, PenLine, ListChecks } from "lucide-react";
import { ProtectedAudio } from "@/components/ProtectedAudio";
import { EXAM_TYPE_LABELS, isMaturitaSimulation, toTwentieths } from "@/lib/examTypes";
import { weightedGrade, type RubricCriterion, type RubricScore } from "@/components/Rubric";
import { DiagnosisEditor } from "@/components/DiagnosisEditor";
import type { DiagnosisRow, DiagnosisDecision, ObjectiveRef } from "@/lib/diagnosis";
import { asScale, fromTenths, formatGrade, LODE, SCALE_RANGE, type GradeScale } from "@/lib/gradeScale";
import { useInstitutionProfile } from "@/lib/institutionProfile";

/** Chi firma e cosa ha gia' preparato un tutor. */
interface Signable {
  validationStatus: string;
  gradeScale: string;
  /** "tutor": chi guarda prepara, poi conferma un docente. */
  signer: "docente" | "tutor";
  prepared: { tutorName: string; grade: number | null; feedback: string } | null;
}

interface PendingPhoto extends Signable {
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
  diagnosis: DiagnosisRow[];
  objectiveOptions: ObjectiveRef[];
}

interface PendingOral extends Signable {
  id: number;
  materialId: number;
  studentName: string;
  grade: number | null;
  feedback: string | null;
  materialTitle: string;
  subject: string;
  createdAt: string;
}

interface PendingWritten extends Signable {
  id: number;
  studentName: string;
  answer: string;
  audioObjectPath: string | null;
  audioSeconds: number | null;
  grade: number | null;
  feedback: string;
  examType: string;
  prompt: string;
  materialTitle: string;
  subject: string;
  createdAt: string;
  diagnosis: DiagnosisRow[];
  objectiveOptions: ObjectiveRef[];
  rubric: RubricCriterion[] | null;
  rubricScores: RubricScore[];
  rubricSuggestedGrade: number | null;
}

interface PendingResponse {
  photoCorrections: PendingPhoto[];
  oralSessions: PendingOral[];
  writtenSubmissions: PendingWritten[];
  total: number;
}

/** Riquadro di firma: il docente conferma o modifica la proposta dell'AI. */
function SignBox({
  proposedGrade,
  proposedFeedback,
  diagnosis,
  objectiveOptions,
  onSign,
  isPending,
  rubric,
  rubricScores,
  twentieths,
  requireGrade,
  scale,
  signer,
  prepared,
}: {
  /** La proposta dell'assistente, in decimi. */
  proposedGrade: number | null;
  proposedFeedback: string;
  /** Se assente, la correzione non ha una diagnosi (es. interrogazioni). */
  diagnosis?: DiagnosisRow[];
  objectiveOptions?: ObjectiveRef[];
  onSign: (
    grade: number | null,
    feedback: string,
    decisions: DiagnosisDecision[],
    rubricScores: Array<{ criterion: string; score: number }>,
  ) => void;
  isPending: boolean;
  /** Griglia approvata del compito, con i punteggi proposti dall'assistente. */
  rubric?: RubricCriterion[] | null;
  rubricScores?: RubricScore[];
  /** true per le simulazioni d'esame: accanto al voto compare l'equivalente in ventesimi. */
  twentieths?: boolean;
  /** true quando non c'e' una proposta da confermare (registrazioni): serve il voto del docente. */
  requireGrade?: boolean;
  scale: GradeScale;
  signer: "docente" | "tutor";
  /** La correzione gia' preparata da un tutor: si parte da quella. */
  prepared: Signable["prepared"];
}) {
  const { terms } = useInstitutionProfile();
  const range = SCALE_RANGE[scale];
  const startGrade = prepared ? prepared.grade : fromTenths(proposedGrade, scale);
  const startFeedback = prepared ? prepared.feedback : proposedFeedback;
  const startText = startGrade === null ? "" : String(scale === "trentesimi" && startGrade === LODE ? 30 : startGrade);
  const proposedScores = Object.fromEntries((rubricScores ?? []).map((s) => [s.criterion, String(s.score)]));
  const [scores, setScores] = useState<Record<string, string>>(proposedScores);
  const numericScores = Object.fromEntries(
    (rubric ?? []).map((c) => [c.name, scores[c.name]?.trim() ? Number(scores[c.name]) : null]),
  );
  const suggested = rubric?.length ? weightedGrade(rubric, numericScores) : null;
  const scoresTouched = (rubric ?? []).some((c) => (scores[c.name] ?? "") !== (proposedScores[c.name] ?? ""));
  const [grade, setGrade] = useState<string>(startText);
  const [lode, setLode] = useState(scale === "trentesimi" && startGrade === LODE);
  const [feedback, setFeedback] = useState<string>(startFeedback);
  const [decisions, setDecisions] = useState<DiagnosisDecision[]>([]);
  const lodeAllowed = scale === "trentesimi" && grade.trim() === "30";
  const gradeValue = grade.trim() === "" ? null : lodeAllowed && lode ? LODE : Number(grade);
  const inputMax = scale === "trentesimi" ? 30 : range.max;
  const gradeOk = gradeValue === null || (Number.isInteger(gradeValue) && gradeValue >= range.min && gradeValue <= range.max);
  const touched =
    grade !== startText ||
    (lodeAllowed && lode) !== (scale === "trentesimi" && startGrade === LODE) ||
    feedback !== startFeedback ||
    decisions.length > 0 ||
    scoresTouched;

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Stamp className="h-4 w-4" />
        {signer === "tutor" ? "La correzione che prepari" : "La tua valutazione"}
        {touched && <Badge variant="outline" className="ml-auto text-[10px]">modificata</Badge>}
      </div>

      {prepared && (
        <p className="rounded-md border border-secondary/30 bg-secondary/5 px-3 py-2 text-xs text-secondary">
          Preparata da <strong>{prepared.tutorName}</strong> (tutor): voto e commento qui sotto sono i suoi, la diagnosi l'ha già
          rivista. Confermando, la correzione arriva {terms.learner === "partecipante" ? "al partecipante" : "allo studente"}.
        </p>
      )}

      {diagnosis && !prepared && (
        <DiagnosisEditor rows={diagnosis} options={objectiveOptions ?? []} onChange={setDecisions} />
      )}

      {rubric && rubric.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <ListChecks className="h-3.5 w-3.5" />
            La tua griglia: punteggi per criterio
            {suggested !== null && (
              <span className="ml-auto font-normal text-muted-foreground">
                media pesata {String(suggested).replace(".", ",")}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-1.5 py-0 text-xs"
                  onClick={() => {
                    setGrade(String(fromTenths(Math.min(10, Math.max(1, suggested)), scale)));
                    setLode(false);
                  }}
                >
                  usa come voto
                </Button>
              </span>
            )}
          </div>
          {rubric.map((c) => {
            const note = rubricScores?.find((s) => s.criterion === c.name)?.note;
            return (
              <div key={c.name} className="flex items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div>
                    {c.name} <span className="text-muted-foreground">· {c.weight}%</span>
                  </div>
                  {note && <div className="text-xs text-muted-foreground">{note}</div>}
                </div>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  className="w-16"
                  aria-label={`Punteggio: ${c.name}`}
                  value={scores[c.name] ?? ""}
                  placeholder="—"
                  onChange={(e) => setScores({ ...scores, [c.name]: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-28 space-y-1.5">
          <Label className="text-xs">Voto {formatGrade(inputMax, scale).replace(/^\d+/, "")}</Label>
          <Input
            type="number"
            min={range.min}
            max={inputMax}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="—"
            aria-invalid={!gradeOk}
          />
          {lodeAllowed && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={lode} onChange={(e) => setLode(e.target.checked)} />e lode
            </label>
          )}
          {!gradeOk && (
            <div className="text-xs text-destructive">
              Da {range.min} a {inputMax}
            </div>
          )}
          {twentieths && scale === "decimi" && grade.trim() !== "" && Number(grade) >= 1 && Number(grade) <= 10 && (
            <div className="text-xs text-muted-foreground">= {toTwentieths(Number(grade))}/20</div>
          )}
        </div>
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Commento per {terms.learner === "partecipante" ? "il partecipante" : "lo studente"}</Label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[80px] resize-none bg-card"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {signer === "tutor" ? (
            <>Prepari la correzione: la conferma un docente del corso, poi arriva a chi l'ha consegnata.</>
          ) : requireGrade ? (
            <>Ascolta la registrazione, poi scrivi voto e commento: allo studente arrivano i tuoi.</>
          ) : (
            <>
              Puoi confermare così com'è o correggere: allo studente arriva la <strong>tua</strong> versione.
            </>
          )}
        </p>
        <Button
          onClick={() =>
            onSign(
              gradeValue,
              feedback,
              decisions,
              (rubric ?? [])
                .map((c) => ({ criterion: c.name, score: Math.round(Number(scores[c.name])) }))
                .filter((s) => s.score >= 1 && s.score <= 10),
            )
          }
          disabled={isPending || !gradeOk || (!!requireGrade && grade.trim() === "")}
          className="w-full shrink-0 sm:w-auto"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {signer === "tutor"
            ? "Prepara per il docente"
            : requireGrade && !prepared
              ? "Firma la valutazione"
              : touched
                ? "Correggi e firma"
                : "Conferma e firma"}
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
      diagnosis,
      rubricScores,
    }: {
      signer: "docente" | "tutor";
      kind: "photo" | "oral" | "written";
      id: number;
      grade: number | null;
      feedback: string;
      diagnosis?: DiagnosisDecision[];
      rubricScores?: Array<{ criterion: string; score: number }>;
    }) => {
      const path =
        kind === "photo"
          ? `/api/photo-corrections/${id}/validate`
          : kind === "oral"
            ? `/api/oral-sessions/${id}/validate`
            : `/api/written-submissions/${id}/validate`;
      return customFetch(path, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(
          kind === "oral"
            ? { grade, feedback }
            : { grade, feedback, diagnosis: diagnosis ?? [], ...(kind === "written" ? { rubricScores: rubricScores ?? [] } : {}) },
        ),
      });
    },
    onSuccess: (_data, vars) => {
      toast(
        vars.signer === "tutor"
          ? { title: "Correzione preparata", description: "Ora la conferma un docente del corso." }
          : { title: "Valutazione firmata", description: "Ora la vede chi ha consegnato il lavoro." },
      );
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
  const writtens = data?.writtenSubmissions ?? [];

  return (
    <TeacherLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Da validare</h1>
          <p className="text-muted-foreground mt-1">
            L'assistente prepara una proposta di valutazione. Nessun voto arriva a chi ha consegnato senza il visto di un docente.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : photos.length === 0 && orals.length === 0 && writtens.length === 0 ? (
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
                  {p.prepared && <Badge className="bg-secondary/15 text-secondary hover:bg-secondary/15 text-[10px]">da confermare</Badge>}
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
                      {p.grade !== null && <Badge variant="outline" className="ml-auto">{formatGrade(fromTenths(p.grade, asScale(p.gradeScale)), asScale(p.gradeScale))}</Badge>}
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
                    scale={asScale(p.gradeScale)}
                    signer={p.signer}
                    prepared={p.prepared}
                    proposedFeedback={p.feedback}
                    diagnosis={p.diagnosis}
                    objectiveOptions={p.objectiveOptions}
                    isPending={sign.isPending}
                    onSign={(grade, feedback, diagnosis) => sign.mutate({ signer: p.signer, kind: "photo", id: p.id, grade, feedback, diagnosis })}
                  />
                </CardContent>
              </Card>
            ))}

            {writtens.map((w) => (
              <Card key={`w-${w.id}`} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
                  <PenLine className="h-4 w-4 text-secondary" />
                  <span className="font-medium">{w.studentName}</span>
                  {w.prepared && <Badge className="bg-secondary/15 text-secondary hover:bg-secondary/15 text-[10px]">da confermare</Badge>}
                  <span className="text-sm text-muted-foreground">
                    · {w.materialTitle} · {w.subject}
                  </span>
                  <Badge variant="outline" className="ml-auto uppercase text-[10px]">{EXAM_TYPE_LABELS[w.examType] ?? w.examType}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(w.createdAt).toLocaleDateString("it-IT")}
                  </span>
                </div>
                <CardContent className="p-5 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Traccia:</span> {w.prompt}
                  </p>

                  {w.audioObjectPath ? (
                    <>
                      <div className="rounded-lg border bg-card p-4 space-y-2">
                        <div className="text-sm font-medium">L'esposizione di {w.studentName}</div>
                        <ProtectedAudio objectPath={w.audioObjectPath} seconds={w.audioSeconds} />
                      </div>
                      <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                        L'assistente non ascolta le registrazioni: qui non c'è nessuna proposta, la valutazione è tutta tua.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg border bg-card p-4">
                        <div className="mb-2 text-sm font-medium">L'elaborato di {w.studentName}</div>
                        <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
                          {w.answer}
                        </p>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Sparkles className="h-4 w-4" />
                          Proposta dell'assistente
                          {w.grade !== null && <Badge variant="outline" className="ml-auto">{formatGrade(fromTenths(w.grade, asScale(w.gradeScale)), asScale(w.gradeScale))}</Badge>}
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{w.feedback}</p>
                      </div>
                    </>
                  )}

                  <SignBox
                    proposedGrade={w.grade}
                    scale={asScale(w.gradeScale)}
                    signer={w.signer}
                    prepared={w.prepared}
                    proposedFeedback={w.feedback}
                    diagnosis={w.audioObjectPath ? undefined : w.diagnosis}
                    objectiveOptions={w.objectiveOptions}
                    isPending={sign.isPending}
                    rubric={w.rubric}
                    rubricScores={w.rubricScores}
                    twentieths={isMaturitaSimulation(w.examType)}
                    requireGrade={!!w.audioObjectPath}
                    onSign={(grade, feedback, diagnosis, rubricScores) =>
                      sign.mutate({ signer: w.signer, kind: "written", id: w.id, grade, feedback, diagnosis, rubricScores })
                    }
                  />
                </CardContent>
              </Card>
            ))}

            {orals.map((o) => (
              <Card key={`o-${o.id}`} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
                  <Mic className="h-4 w-4 text-secondary" />
                  <span className="font-medium">{o.studentName}</span>
                  {o.prepared && <Badge className="bg-secondary/15 text-secondary hover:bg-secondary/15 text-[10px]">da confermare</Badge>}
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
                      {o.grade !== null && <Badge variant="outline" className="ml-auto">{formatGrade(fromTenths(o.grade, asScale(o.gradeScale)), asScale(o.gradeScale))}</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{o.feedback ?? "—"}</p>
                  </div>

                  <SignBox
                    proposedGrade={o.grade}
                    scale={asScale(o.gradeScale)}
                    signer={o.signer}
                    prepared={o.prepared}
                    proposedFeedback={o.feedback ?? ""}
                    isPending={sign.isPending}
                    onSign={(grade, feedback) => sign.mutate({ signer: o.signer, kind: "oral", id: o.id, grade, feedback })}
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
