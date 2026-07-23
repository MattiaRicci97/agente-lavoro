import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListMaterials, customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { downscaleToJpeg } from "@/lib/image";
import {
  Camera,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ScanLine,
  Sparkles,
  RefreshCw,
} from "lucide-react";

interface PhotoCorrection {
  id: number;
  subject: string;
  grade: number | null;
  transcription: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  createdAt: string;
}

function gradeColor(grade: number | null): string {
  if (grade === null) return "bg-muted text-muted-foreground";
  if (grade >= 6) return "bg-green-100 text-green-800 border-green-200";
  return "bg-red-100 text-red-800 border-red-200";
}

export default function StudioFoto() {
  const { toast } = useToast();
  const { data: materials } = useListMaterials();
  const { uploadFile, isUploading } = useUpload();

  const [preview, setPreview] = useState<string | null>(null);
  const [processedFile, setProcessedFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PhotoCorrection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["photoCorrections"],
    queryFn: () => customFetch<PhotoCorrection[]>("/api/photo-corrections/mine", { responseType: "json" }),
  });

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreparing(true);
    try {
      const jpeg = await downscaleToJpeg(file);
      setProcessedFile(jpeg);
      setPreview(URL.createObjectURL(jpeg));
    } catch (err: any) {
      toast({ title: "Errore", description: err?.message ?? "Immagine non valida.", variant: "destructive" });
    } finally {
      setPreparing(false);
    }
  }

  function onPickMaterial(value: string) {
    if (!value) {
      setMaterialId(null);
      return;
    }
    const m = materials?.find((x) => String(x.id) === value);
    if (m) {
      setMaterialId(m.id);
      setSubject(m.subject);
      setGradeLevel(m.gradeLevel);
    }
  }

  async function handleSubmit() {
    if (!processedFile) {
      toast({ title: "Manca la foto", description: "Scatta o carica la foto del compito.", variant: "destructive" });
      return;
    }
    if (!subject.trim()) {
      toast({ title: "Manca la materia", description: "Indica la materia del compito.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await uploadFile(processedFile);
      if (!uploaded) throw new Error("Caricamento della foto non riuscito.");

      const data = await customFetch<PhotoCorrection>("/api/photo-corrections", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          imageObjectPath: uploaded.objectPath,
          fileName: processedFile.name,
          subject: subject.trim(),
          gradeLevel: gradeLevel.trim(),
          assignmentPrompt: assignmentPrompt.trim() || undefined,
          materialId,
        }),
      });
      setResult(data);
      refetchHistory();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast({
        title: "Correzione non riuscita",
        description: err?.data?.error ?? err?.message ?? "Riprova con una foto più nitida.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setPreview(null);
    setProcessedFile(null);
    setAssignmentPrompt("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const busy = preparing || isUploading || submitting;

  // --- Schermata risultato ---
  if (result) {
    return (
      <StudentLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Button variant="ghost" className="-ml-4" onClick={reset}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Correggi un altro compito
          </Button>

          <Card className="overflow-hidden">
            <div className="bg-secondary/5 border-b border-secondary/10 p-6 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-secondary">{result.subject}</div>
                <h1 className="font-display text-2xl font-semibold">Compito corretto</h1>
              </div>
              <div className={`rounded-2xl border px-5 py-3 text-center ${gradeColor(result.grade)}`}>
                <div className="text-3xl font-bold leading-none">{result.grade ?? "—"}</div>
                <div className="text-[11px] font-medium uppercase tracking-wide">/10</div>
              </div>
            </div>
            <CardContent className="p-6 space-y-6">
              {preview && (
                <img src={preview} alt="Il tuo compito" className="max-h-64 w-auto rounded-lg border mx-auto" />
              )}

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-1">Valutazione del prof</h3>
                <p className="leading-relaxed whitespace-pre-wrap">{result.feedback}</p>
              </div>

              {result.strengths.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 mb-2">
                    <CheckCircle2 className="h-4 w-4" /> Punti di forza
                  </h3>
                  <ul className="space-y-1.5">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-[15px]">
                        <span className="text-green-600 mt-1">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.improvements.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-2">
                    <AlertCircle className="h-4 w-4" /> Da migliorare
                  </h3>
                  <ul className="space-y-1.5">
                    {result.improvements.map((s, i) => (
                      <li key={i} className="flex gap-2 text-[15px]">
                        <span className="text-amber-600 mt-1">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.transcription && (
                <details className="rounded-lg border bg-muted/30 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    Come ho letto il tuo compito
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {result.transcription}
                  </p>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  // --- Schermata di invio ---
  return (
    <StudentLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
            <ScanLine className="h-7 w-7" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-secondary">Correggi il compito da una foto</h1>
          <p className="text-muted-foreground text-balance">
            Fotografa il tuo compito scritto a mano: il prof AI lo legge, lo corregge e ti dà voto e consigli.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickFile}
            />

            {preview ? (
              <div className="relative">
                <img src={preview} alt="Anteprima compito" className="max-h-72 w-auto rounded-lg border mx-auto" />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Cambia foto
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={preparing}
                className="hover-elevate flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-secondary/30 bg-secondary/5 py-12 text-secondary transition-colors"
              >
                {preparing ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <Camera className="h-8 w-8" />
                )}
                <span className="font-medium">{preparing ? "Preparo la foto..." : "Scatta o carica la foto"}</span>
                <span className="text-xs text-muted-foreground">Da telefono si apre la fotocamera</span>
              </button>
            )}

            {materials && materials.length > 0 && (
              <div className="space-y-2">
                <Label>Collega a un materiale (facoltativo)</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={materialId ?? ""}
                  onChange={(e) => onPickMaterial(e.target.value)}
                >
                  <option value="">Nessuno</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} — {m.subject}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="subject">Materia *</Label>
                <Input
                  id="subject"
                  placeholder="es. Matematica"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">Livello (facoltativo)</Label>
                <Input
                  id="grade"
                  placeholder="es. 3ª superiore"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Cosa chiedeva il compito? (facoltativo)</Label>
              <Textarea
                id="prompt"
                placeholder="es. Risolvi l'equazione e spiega i passaggi / Analizza la poesia..."
                className="min-h-[70px] resize-none"
                value={assignmentPrompt}
                onChange={(e) => setAssignmentPrompt(e.target.value)}
              />
            </div>

            <Button
              className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              size="lg"
              onClick={handleSubmit}
              disabled={busy || !processedFile}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {submitting ? "Il prof sta correggendo..." : "Preparo l'invio..."}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Correggi il compito
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {history && history.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-muted-foreground">Correzioni recenti</h2>
            <div className="space-y-2">
              {history.slice(0, 6).map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{h.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
                    </div>
                  </div>
                  <Badge variant="outline" className={gradeColor(h.grade)}>
                    {h.grade ?? "—"}/10
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {!history && <Skeleton className="h-20 w-full" />}
      </div>
    </StudentLayout>
  );
}
