import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Send, Loader2, User } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Chi è in difficoltà e su cosa?",
  "Su quali argomenti devo insistere nella prossima lezione?",
  "Come sta andando la classe rispetto alla settimana scorsa?",
  "Quali studenti non si esercitano da più di una settimana?",
];

export default function CattedraAssistente() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (question: string) =>
      customFetch<{ answer: string }>("/api/assistant", {
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
        description: err?.data?.error ?? "L'assistente non ha risposto. Riprova.",
        variant: "destructive",
      });
    },
  });

  function send(question?: string) {
    const q = (question ?? draft).trim();
    if (!q || ask.isPending) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    ask.mutate(q);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ask.isPending]);

  return (
    <TeacherLayout>
      <div className="p-8 max-w-3xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
        <div className="pb-4">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-primary" />
            Assistente di classe
          </h1>
          <p className="text-muted-foreground mt-1">
            Fai domande sui dati reali delle tue classi: risultati, lacune, studenti da seguire.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 rounded-lg border bg-muted/20 p-6">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Prova a chiedere:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-sm border rounded-full px-4 py-2 bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors"
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
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                {m.role === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>
              <div
                className={`p-4 rounded-2xl max-w-[85%] text-[15px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border rounded-tl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {ask.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="p-4 bg-card border rounded-2xl rounded-tl-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sto analizzando i dati delle tue classi...
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
            placeholder="es. Chi devo interrogare questa settimana?"
            className="resize-none min-h-[60px]"
            disabled={ask.isPending}
          />
          <Button className="h-auto px-6" onClick={() => send()} disabled={ask.isPending || !draft.trim()}>
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </TeacherLayout>
  );
}
