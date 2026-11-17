import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, RotateCcw } from "lucide-react";
import { MAX_AUDIO_SECONDS } from "@/lib/examTypes";

export interface Recording {
  file: File;
  seconds: number;
}

function pickMimeType(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Registra la voce dello studente dal microfono del dispositivo, fino a tre
 * minuti. La registrazione resta sul dispositivo finche' lo studente non la
 * consegna: puo' riascoltarla e rifarla quante volte vuole.
 */
export function AudioRecorder({ value, onChange }: { value: Recording | null; onChange: (recording: Recording | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const format = pickMimeType();

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function cleanup() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  // Uscendo dalla pagina il microfono si spegne.
  useEffect(() => () => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    cleanup();
  }, []);

  async function start() {
    if (!format) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        const length = Math.max(1, Math.min(MAX_AUDIO_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000)));
        cleanup();
        setRecording(false);
        const blob = new Blob(chunks, { type: format.mimeType.split(";")[0] });
        if (blob.size > 0) onChange({ file: new File([blob], `esposizione.${format.extension}`, { type: blob.type }), seconds: length });
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      recorder.start(1000);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
        // Al limite la registrazione si chiude da sola.
        if (elapsed >= MAX_AUDIO_SECONDS && recorder.state === "recording") recorder.stop();
      }, 500);
    } catch {
      cleanup();
      setRecording(false);
      setError("Non riesco ad accedere al microfono. Controlla di aver dato il permesso a Sillabo nelle impostazioni.");
    }
  }

  if (!format || !navigator.mediaDevices?.getUserMedia) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Questo dispositivo non permette di registrare l'audio dal browser. Prova dall'app o da un altro dispositivo.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-5">
      {recording ? (
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="destructive" size="lg" onClick={() => recorderRef.current?.stop()}>
            <Square className="mr-2 h-4 w-4" /> Ferma
          </Button>
          <div className="flex items-center gap-2 text-lg tabular-nums">
            <span className="h-3 w-3 animate-pulse rounded-full bg-rose-500" aria-hidden />
            {clock(seconds)} <span className="text-sm text-muted-foreground">/ {clock(MAX_AUDIO_SECONDS)}</span>
          </div>
        </div>
      ) : value && previewUrl ? (
        <div className="space-y-3">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Durata {clock(value.seconds)}. Riascoltala: se non ti convince, rifalla.</span>
            <Button variant="outline" size="sm" onClick={() => { onChange(null); void start(); }}>
              <RotateCcw className="mr-2 h-4 w-4" /> Registra di nuovo
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" onClick={() => void start()}>
            <Mic className="mr-2 h-4 w-4" /> Registra
          </Button>
          <span className="text-sm text-muted-foreground">Fino a {MAX_AUDIO_SECONDS / 60} minuti. Trova un posto tranquillo.</span>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
