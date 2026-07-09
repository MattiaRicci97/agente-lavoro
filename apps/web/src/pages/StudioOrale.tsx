import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetMaterial, 
  getGetMaterialQueryKey,
  useStartOralSession,
  useReplyToOralSession
} from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, User, Bot, Loader2 } from "lucide-react";

export default function StudioOrale() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { toast } = useToast();
  
  const [studentName, setStudentName] = useState("");
  const [session, setSession] = useState<any>(null);
  const [currentMessage, setCurrentMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: material, isLoading: materialLoading } = useGetMaterial(materialId, { 
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) } 
  });

  const startSession = useStartOralSession();
  const replySession = useReplyToOralSession();

  const handleStart = () => {
    if (!studentName.trim()) {
      toast({ title: "Attenzione", description: "Inserisci il tuo nome per iniziare.", variant: "destructive" });
      return;
    }
    
    startSession.mutate({
      id: materialId,
      data: { studentName }
    }, {
      onSuccess: (data) => {
        setSession(data);
      },
      onError: () => {
        toast({ title: "Errore", description: "Impossibile avviare l'interrogazione.", variant: "destructive" });
      }
    });
  };

  const handleSend = () => {
    if (!currentMessage.trim() || !session) return;
    
    const messageContent = currentMessage;
    setCurrentMessage("");
    
    // Optimistic UI update
    setSession((prev: any) => ({
      ...prev,
      messages: [...prev.messages, { id: Date.now(), role: "student", content: messageContent }]
    }));

    replySession.mutate({
      id: session.id,
      data: { content: messageContent }
    }, {
      onSuccess: (data) => {
        setSession(data);
      },
      onError: () => {
        toast({ title: "Errore", description: "Errore nell'invio del messaggio.", variant: "destructive" });
        setCurrentMessage(messageContent); // Restore on error
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);


  if (materialLoading) return <StudentLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></StudentLayout>;
  if (!material) return <StudentLayout><div className="text-center p-12">Materiale non trovato.</div></StudentLayout>;

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
                <p className="text-muted-foreground text-sm">Il prof. virtuale ti farà delle domande sull'argomento, incalzando e chiedendo collegamenti. Rispondi con cura.</p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="studentName">Il tuo nome</Label>
                  <Input 
                    id="studentName" 
                    placeholder="Mario Rossi" 
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                  />
                </div>
                <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground" size="lg" onClick={handleStart} disabled={startSession.isPending}>
                  {startSession.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Siediti alla cattedra
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
            </h1>
            <p className="text-sm text-muted-foreground">Argomento: {material.title}</p>
          </div>
          {isCompleted && (
            <div className="bg-secondary/10 text-secondary px-4 py-1 rounded-full text-sm font-medium">
              Voto: {session.grade}/10
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-muted/20 rounded-lg mt-4 shadow-inner">
          {session.messages.map((msg: any, i: number) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'student' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'student' ? 'bg-primary text-primary-foreground' : 'bg-secondary/20 text-secondary'
              }`}>
                {msg.role === 'student' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`p-4 rounded-2xl max-w-[80%] ${
                msg.role === 'student' 
                  ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm' 
                  : 'bg-card border rounded-tl-sm shadow-sm'
              }`}>
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
                <Loader2 className="w-4 h-4 animate-spin" /> Il prof sta scrivendo...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isCompleted ? (
          <div className="mt-4 pt-4 border-t flex gap-2">
            <Textarea 
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi la tua risposta... (Shift+Enter per andare a capo)"
              className="resize-none min-h-[80px]"
              disabled={replySession.isPending}
            />
            <Button 
              className="h-auto px-6 bg-secondary hover:bg-secondary/90 text-secondary-foreground" 
              onClick={handleSend}
              disabled={replySession.isPending || !currentMessage.trim()}
            >
              <Send className="w-5 h-5" />
            </Button>
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
