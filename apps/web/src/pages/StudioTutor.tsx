import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useGetMaterial, getGetMaterialQueryKey, customFetch } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTextToSpeech, speechSupported } from "@/hooks/use-voice";
import { GraduationCap, Send, Loader2, User, ArrowLeft, Volume2, VolumeX } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Non ho capito questo argomento, me lo spieghi?",
  "Puoi farmi un esempio concreto?",
  "Spiegamelo in modo più semplice",
  "Qual è la cosa più importante da ricordare?",
];

export default function StudioTutor() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const spokenRef = useRef<number>(0);

  const support = speechSupported();
  const { speak, stopSpeaking } = useTextToSpeech();

  const { data: material, isLoading } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });

  const ask = useMutation({
    mutationFn: (question: string) =>
      customFetch<{ answer: string }>(`/api/materials/${materialId}/tutor`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ question, history: messages.slice(-8) }),
      }),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    },
    onError: (err: any) => {
      toast({
        title: "Errore",
        description: err?.data?.error ?? "Il tutor non ha risposto. Riprova.",
        variant: "destructive",
      });
    },
  });

  function send(question?: string) {
    const q = (question ?? draft).trim();
    if (!q || ask.isPending) return;
    stopSpeaking();
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    ask.mutate(q);
  }

  // Legge ad alta voce le nuove risposte del tutor quando la lettura è attiva.
  useEffect(() => {
    if (!readAloud || !support.tts) return;
    if (messages.length <= spokenRef.current) return;
    const last = messages[messages.length - 1];
    spokenRef.current = messages.length;
    if (last?.role === "assistant") speak(last.content);
  }, [messages, readAloud, support.tts, speak]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ask.isPending]);

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </StudentLayout>
    );
  }
  if (!material) {
    return (
      <StudentLayout>
        <div className="text-center p-12">Materiale non trovato.</div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-start justify-between gap-4 pb-4 border-b">
          <div>
            <Button variant="ghost" asChild className="mb-2 -ml-4 h-8">
              <Link href="/studio">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Materiali
              </Link>
            </Button>
            <h1 className="font-display text-2xl font-semibold text-secondary flex items-center gap-2">
              <GraduationCap className="h-6 w-6" />
              Tutor · {material.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Chiedi tutto quello che non ti è chiaro. Sono qui per aiutarti a capire, non per interrogarti.
            </p>
          </div>
          {support.tts && (
            <Button
              variant="ghost"
              size="icon"
              title={readAloud ? "Disattiva la lettura" : "Leggi le risposte ad alta voce"}
              onClick={() => {
                if (readAloud) stopSpeaking();
                setReadAloud(!readAloud);
              }}
            >
              {readAloud ? <Volume2 className="h-4 w-4 text-secondary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 bg-muted/20 rounded-lg mt-4 p-6 shadow-inner">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Non sai da dove iniziare? Prova a chiedere:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="hover-elevate text-sm border rounded-full px-4 py-2 bg-card hover:border-secondary/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/15 text-secondary"
                }`}
              >
                {m.role === "user" ? <User className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
              </div>
              <div
                className={`p-4 rounded-2xl max-w-[85%] text-[15px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-card border rounded-tl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {ask.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/15 text-secondary flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="p-4 bg-card border rounded-2xl rounded-tl-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sto preparando una spiegazione...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="pt-4 flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Scrivi qui il tuo dubbio... (es. non ho capito la fotosintesi)"
            className="resize-none min-h-[60px]"
            disabled={ask.isPending}
          />
          <Button
            className="h-auto px-6 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            onClick={() => send()}
            disabled={ask.isPending || !draft.trim()}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </StudentLayout>
  );
}
