import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AudioScript } from "@/components/AudioScript";
import { useToast } from "@/hooks/use-toast";
import { Wrench, Sparkles, Loader2, Trash2, AlertTriangle, Lightbulb, BookA, Languages, Headphones, type LucideIcon } from "lucide-react";

type Kind = "errori_tipici" | "spunti" | "glossario" | "traduzione" | "ripasso_audio";

interface Tool {
  kind: Kind;
  language: string | null;
  body: string;
  shared: boolean;
  untouched: boolean;
}

const TOOLS: Array<{ kind: Kind; title: string; hint: string; icon: LucideIcon; shareable: boolean }> = [
  { kind: "errori_tipici", title: "Errori tipici", hint: "Le misconcezioni più frequenti e come prevenirle. Solo per te.", icon: AlertTriangle, shareable: false },
  { kind: "spunti", title: "Spunti per iniziare", hint: "Tre modi per aprire la lezione in cinque minuti. Solo per te.", icon: Lightbulb, shareable: false },
  { kind: "glossario", title: "Glossario", hint: "I termini chiave con una definizione breve. Puoi condividerlo con la classe.", icon: BookA, shareable: true },
  { kind: "traduzione", title: "Sintesi tradotta", hint: "Per studenti arrivati da poco e per le famiglie. Puoi condividerla con la classe.", icon: Languages, shareable: true },
  { kind: "ripasso_audio", title: "Ripasso da ascoltare", hint: "Un copione di tre o quattro minuti che la classe ascolta a casa, letto dal telefono. Puoi condividerlo.", icon: Headphones, shareable: true },
];

function ToolRow({
  materialId,
  spec,
  tool,
  languages,
  onChanged,
}: {
  materialId: number;
  spec: (typeof TOOLS)[number];
  tool: Tool | undefined;
  languages: string[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(tool?.body ?? "");
  const [shared, setShared] = useState(tool?.shared ?? false);
  const [language, setLanguage] = useState(tool?.language ?? "");
  // Quando arriva (o cambia) il testo salvato, il riquadro riparte da li' senza chiudersi.
  useEffect(() => {
    setBody(tool?.body ?? "");
    setShared(tool?.shared ?? false);
    if (tool?.language) setLanguage(tool.language);
  }, [tool?.body, tool?.shared, tool?.language]);
  const Icon = spec.icon;
  const base = `/api/materials/${materialId}/tools/${spec.kind}`;

  const onError = (err: any) =>
    toast({ title: "Errore", description: err?.data?.error ?? "Operazione non riuscita.", variant: "destructive" });

  const draft = useMutation({
    mutationFn: () =>
      customFetch<Tool>(`${base}/draft`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(spec.kind === "traduzione" ? { language } : {}),
      }),
    onSuccess: (data) => {
      setBody(data.body);
      setShared(false);
      setOpen(true);
      onChanged();
    },
    onError,
  });

  const save = useMutation({
    mutationFn: () => customFetch<Tool>(base, { method: "PUT", responseType: "json", body: JSON.stringify({ body: body.trim(), shared }) }),
    onSuccess: (data) => {
      toast({
        title: "Salvato",
        description: data.shared ? "La classe lo trova tra i materiali." : "Resta visibile solo a te.",
      });
      onChanged();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => customFetch(base, { method: "DELETE" }),
    onSuccess: () => {
      setBody("");
      setShared(false);
      setOpen(false);
      onChanged();
    },
    onError,
  });

  const busy = draft.isPending || save.isPending || remove.isPending;
  const needsLanguage = spec.kind === "traduzione" && !language;
  const dirty = body.trim() !== (tool?.body ?? "") || shared !== (tool?.shared ?? false);

  return (
    <div className="border-b pb-3 last:border-0 last:pb-0">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {spec.title}
            {tool?.language && <Badge variant="outline" className="text-[10px]">{tool.language}</Badge>}
            {tool?.shared && <Badge variant="outline" className="border-green-200 bg-green-50 text-[10px] text-green-800">Condiviso</Badge>}
            {tool?.untouched && <Badge variant="outline" className="text-[10px] text-muted-foreground">Bozza dell'assistente</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{spec.hint}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {spec.kind === "traduzione" && (
          <Select value={language || undefined} onValueChange={setLanguage}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="Lingua" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || needsLanguage} onClick={() => draft.mutate()}>
          {draft.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          {tool ? "Rigenera" : "Prepara"}
        </Button>
        {tool && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(!open)}>
            {open ? "Chiudi" : "Apri"}
          </Button>
        )}
        {!tool && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(true)}>
            Scrivilo tu
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[200px] text-xs leading-relaxed" />
          {spec.kind === "ripasso_audio" && body.trim() && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Ascoltalo prima di condividerlo: ogni riga che comincia con ## apre una nuova parte.
              </p>
              <AudioScript body={body} compact />
            </div>
          )}
          {spec.shareable && (
            <label className="flex items-start gap-2 text-xs">
              <Switch checked={shared} onCheckedChange={setShared} className="mt-0.5" />
              <span>
                Condividi con la classe
                {spec.kind === "traduzione" && (
                  <span className="block text-muted-foreground">
                    Agli studenti comparirà come traduzione automatica: se non conosci la lingua, non puoi garantirne la correttezza.
                  </span>
                )}
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !body.trim() || !dirty} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
            {tool && (
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => remove.mutate()}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Elimina
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** La cassetta degli attrezzi del docente per un materiale. */
export function MaterialTools({ materialId }: { materialId: number }) {
  const queryClient = useQueryClient();
  const key = ["materialTools", materialId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => customFetch<{ tools: Tool[]; languages: string[] }>(`/api/materials/${materialId}/tools`, { responseType: "json" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Strumenti per la lezione
        </CardTitle>
        <CardDescription>L'assistente prepara una prima stesura da questo materiale; la riscrivi e decidi tu cosa farne.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {TOOLS.map((spec) => {
          const tool = data?.tools.find((t) => t.kind === spec.kind);
          return (
            <ToolRow
              key={spec.kind}
              materialId={materialId}
              spec={spec}
              tool={tool}
              languages={data?.languages ?? []}
              onChanged={() => queryClient.invalidateQueries({ queryKey: key })}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
