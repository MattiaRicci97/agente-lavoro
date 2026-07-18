import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  useGetMaterial,
  getGetMaterialQueryKey,
  useStartOralSession,
  useReplyToOralSession,
  useGetMe,
} from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSpeechToText, useTextToSpeech, speechSupported } from "@/hooks/use-voice";
import { Send, User, Bot, Loader2, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

export default function StudioOrale() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();

  const [session, setSession] = useState<any>(null);
  const [currentMessage, setCurrentMessage] = useState("");
  const [voiceMode, setVoiceMode] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());

  const { data: me } = useGetMe();
  const studentName = me?.studentMemberships?.[0]?.name ?? "";

  const { data: material, isLoading: materialLoading } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });

  const startSession = useStartOralSession();
  const replySession = useReplyToOralSession();

  const support = speechSupported();
  const { speaking, speak, stopSpeaking } = useTextToSpeech();
  const { listening, interim, start: startListening, stop: stopListening } = useSpeechToText((text) => {
    setCurrentMessage((prev) => (prev ? `${prev} ${text}` : text));
  });

  // Legge ad alta voce i nuovi messaggi del professore quando la voce e' attiva.
  useEffect(() => {
    if (!voiceMode || !support.tts || !session?.messages?.length) return;
    const lastExaminer = [...session.messages].reverse().find((m: any) => m.role === "examiner");
    if (!lastExaminer) return;
    const key = String(lastExaminer.id ?? lastExaminer.content);
    if (spokenIdsRef.current.has(key)) return;
    spokenIdsRef.current.add(key);
    speak(lastExaminer.content);
  }, [session?.messages, voiceMode, support.tts, speak]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  const handleStart = () => {
    if (!studentName) {
      toast({ title: "Attenzione", description: "Devi essere iscritto a una classe per iniziare.", variant: "destructive" });
      return;
    }
    startSession.mutate(
      { id: materialId, data: { studentName } },
      {
        onSuccess: (data) => setSession(data),
        onError: () => toast({ title: "Errore", description: "Impossibile avviare l'interrogazione.", variant: "destructive" }),
      },
    );
  };

  const handleSend = (overrideText?: string) => {
    const messageContent = (overrideText ?? currentMessage).trim();
    if (!messageContent || !session) return;

    stopSpeaking();
    setCurrentMessage("");

    setSession((prev: any) => ({
      ...prev,
      messages: [...prev.messages, { id: Date.now(), role: "student", content: messageContent }],
    }));

    replySession.mutate(
      { id: session.id, data: { content: messageContent } },
      {
        onSuccess: (data) => setSession(data),
        onError: () => {
          toast({ title: "Errore", description: "Errore nell'invio del messaggio.", variant: "destructive" });
          setCurrentMessage(messageContent);
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);

  if (materialLoading)
    return (
      <StudentLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </StudentLayout>
    );
  if (!material)
    return (
      <StudentLayout>
        <div className="text-center p-12">Materiale non trovato.</div>
      </StudentLayout>
    );

  if (!session) {
    return (
      <StudentLayout>
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold text-secondary">Interrogazione: {material.title}</h1>
                <p className="text-muted-foreground text-sm">
                  Il prof. virtuale ti fara' delle domande sull'argomento, incalzando e chiedendo collegamenti — e se vuoi,
                  a voce, come una vera interrogazione.
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-secondary" />
                    <div>
                      <Label htmlFor="voiceMode" className="cursor-pointer">Modalita' voce</Label>
                      <p className="text-xs text-muted-foreground">
                        {support.tts
                          ? "Il prof parla e tu rispondi col microfono."
                          : "Il tuo browser non supporta la voce: usa Chrome."}
                      </p>
                    </div>
                  </div>
                  <Switch id="voiceMode" checked={voiceMode && support.tts} onCheckedChange={setVoiceMode} disabled={!support.tts} />
                </div>

                <Button
                  className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  size="lg"
                  onClick={handleStart}
                  disabled={startSession.isPending || !studentName}
                >
                  {startSession.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {studentName ? `Siediti alla cattedra, ${studentName.split(" ")[0]}` : "Caricamento..."}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  const isCompleted = session.status === "completata";

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Bot className="w-5 h-5 text-secondary" />
              Prof. AI
              {speaking && <span className="text-xs font-normal text-secondary animate-pulse">sta parlando...</span>}
            </h1>
            <p className="text-sm text-muted-foreground">Argomento: {material.title}</p>
          </div>
          <div className="flex items-center gap-3">
            {support.tts && (
              <Button
                variant="ghost"
                size="icon"
                title={voiceMode ? "Disattiva la voce" : "Attiva la voce"}
                onClick={() => {
                  if (voiceMode) stopSpeaking();
                  setVoiceMode(!voiceMode);
                }}
              >
                {voiceMode ? <Volume2 className="h-4 w-4 text-secondary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              </Button>
            )}
            {isCompleted && (
              <div className="bg-secondary/10 text-secondary px-4 py-1 rounded-full text-sm font-medium">
                Voto: {session.grade}/10
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-muted/20 rounded-lg mt-4 shadow-inner">
          {session.messages.map((msg: any, i: number) => (
            <div key={i} className={`flex gap-4 ${msg.role === "student" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "student" ? "bg-primary text-primary-foreground" : "bg-secondary/20 text-secondary"
                }`}
              >
                {msg.role === "student" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div
                className={`p-4 rounded-2xl max-w-[80%] ${
                  msg.role === "student"
                    ? "bg-primary text-primary-foreground rounded-tr-sm shadow-sm"
                    : "bg-card border rounded-tl-sm shadow-sm"
                }`}
              >
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {replySession.isPending && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 bg-card border rounded-2xl rounded-tl-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Il prof sta pensando...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isCompleted ? (
          <div className="mt-4 pt-4 border-t space-y-2">
            {listening && (
              <div className="flex items-center gap-2 text-sm text-secondary">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
                </span>
                Ti sto ascoltando... {interim && <span className="text-muted-foreground italic truncate">{interim}</span>}
              </div>
            )}
            <div className="flex gap-2">
              {support.stt && (
                <Button
                  type="button"
                  variant={listening ? "default" : "outline"}
                  className={`h-auto px-4 ${listening ? "bg-secondary text-secondary-foreground" : ""}`}
                  onClick={() => (listening ? stopListening() : startListening())}
                  disabled={replySession.isPending}
                  title={listening ? "Ferma la dettatura" : "Rispondi a voce"}
                >
                  {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
              )}
              <Textarea
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  support.stt
                    ? "Parla col microfono o scrivi la tua risposta..."
                    : "Scrivi la tua risposta... (Shift+Enter per andare a capo)"
                }
                className="resize-none min-h-[80px]"
                disabled={replySession.isPending}
              />
              <Button
                className="h-auto px-6 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                onClick={() => handleSend()}
                disabled={replySession.isPending || !currentMessage.trim()}
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        ) : (
          <Card className="mt-6 border-secondary/30 bg-secondary/5">
            <CardContent className="p-6">
              <h3 className="font-bold text-lg mb-2 text-secondary">Feedback Finale</h3>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{session.feedback}</p>
              <div className="mt-6 text-center">
                <Button asChild variant="outline">
                  <Link href="/studio">Torna ai materiali</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </StudentLayout>
  );
}
