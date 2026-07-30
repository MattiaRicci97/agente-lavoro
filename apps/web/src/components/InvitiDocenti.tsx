import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListClasses } from "@sillabo/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MailPlus, Copy, Check, X, Star } from "lucide-react";

interface PendingInvite {
  id: number;
  token: string;
  email: string;
  role: "amministratore" | "docente";
  classId: number | null;
  subject: string;
  className: string | null;
  status: string;
  createdAt: string;
}

const NO_CLASS = "__nessuna__";

function inviteLink(token: string) {
  return `${window.location.origin}/invito/${token}`;
}

/**
 * Inviti dei docenti all'istituto.
 *
 * L'amministratore genera un link e lo inoltra come preferisce. Chi lo apre si
 * registra e si ritrova già dentro l'istituto: niente più "prima registrati,
 * poi ti attivo".
 */
export function InvitiDocenti({ institutionId }: { institutionId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes } = useListClasses();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"amministratore" | "docente">("docente");
  const [classId, setClassId] = useState<string>(NO_CLASS);
  const [subject, setSubject] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const queryKey = ["institutionInvites", institutionId];
  const { data: invites, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      customFetch<PendingInvite[]>(`/api/institutions/${institutionId}/invites`, { responseType: "json" }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["institutionLicense", institutionId] });
  };

  const create = useMutation({
    mutationFn: () =>
      customFetch<PendingInvite>(`/api/institutions/${institutionId}/invites`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          email: email.trim(),
          role,
          classId: classId === NO_CLASS ? null : Number(classId),
          subject: subject.trim(),
        }),
      }),
    onSuccess: async (inv) => {
      setEmail("");
      setRole("docente");
      setClassId(NO_CLASS);
      setSubject("");
      refresh();
      try {
        await navigator.clipboard.writeText(inviteLink(inv.token));
        toast({ title: "Invito creato", description: "Il link è già copiato: incollalo dove vuoi." });
      } catch {
        toast({ title: "Invito creato", description: "Copia il link dall'elenco qui sotto." });
      }
    },
    onError: (err: any) =>
      toast({
        title: "Invito non creato",
        description: err?.data?.error ?? "Riprova.",
        variant: "destructive",
      }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => customFetch(`/api/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Invito ritirato" });
      refresh();
    },
    onError: (err: any) =>
      toast({ title: "Operazione non riuscita", description: err?.data?.error ?? "Riprova.", variant: "destructive" }),
  });

  const copy = async (inv: PendingInvite) => {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.token));
      setCopied(inv.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Copia non riuscita", description: inviteLink(inv.token) });
    }
  };

  const pending = invites ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailPlus className="h-[18px] w-[18px] text-secondary" />
          Invita docenti
        </CardTitle>
        <CardDescription>
          Genera un link d'invito: chi lo apre si registra ed è subito dentro l'istituto, senza attivazione manuale.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form
          className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) create.mutate();
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Email del docente</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.cognome@scuola.it"
              className="bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ruolo</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="docente">Docente</SelectItem>
                <SelectItem value="amministratore">Amministratore</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Classe (facoltativa)</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLASS}>Nessuna</SelectItem>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {classId !== NO_CLASS && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Materia in quella classe</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="es. Matematica"
                className="bg-card"
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending || !email.trim()}>
              <MailPlus className="mr-2 h-4 w-4" />
              Crea invito e copia il link
            </Button>
          </div>
        </form>

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun invito in sospeso.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {pending.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {inv.email}
                    {inv.role === "amministratore" && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Star className="h-2.5 w-2.5 fill-secondary text-secondary" />
                        Admin
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    In attesa
                    {inv.className && <> · {inv.className}{inv.subject && ` (${inv.subject})`}</>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => copy(inv)}>
                  {copied === inv.id ? (
                    <><Check className="mr-1.5 h-3.5 w-3.5" /> Copiato</>
                  ) : (
                    <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copia link</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => revoke.mutate(inv.id)}
                  aria-label="Ritira l'invito"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
