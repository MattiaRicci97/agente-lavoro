import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Star, GraduationCap, Loader2, XCircle, LogIn } from "lucide-react";

/** Dove ricordiamo l'invito mentre l'utente si registra o accede. */
export const PENDING_INVITE_KEY = "sillabo.pendingInvite";

interface InvitePreview {
  institutionName: string;
  city: string;
  role: "amministratore" | "docente";
  className: string | null;
  subject: string;
  inviterName: string | null;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

const STATUS_MESSAGE: Record<string, string> = {
  accepted: "Questo invito è già stato accettato. Accedi con il tuo account.",
  revoked: "Questo invito è stato ritirato dall'istituto.",
  expired: "Questo invito è scaduto. Chiedine uno nuovo all'amministratore.",
};

export default function Invito() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invitePreview", token],
    queryFn: () => customFetch<InvitePreview>(`/api/invites/${token}`, { responseType: "json" }),
    retry: false,
  });

  // Finché l'utente non è loggato, ricordiamo l'invito così da tornarci dopo.
  // Un invito non più valido non deve intrappolare l'utente in un rimbalzo:
  // appena si scopre che non è pending, si dimentica.
  useEffect(() => {
    if (token) localStorage.setItem(PENDING_INVITE_KEY, token);
  }, [token]);
  useEffect(() => {
    if (data && data.status !== "pending") localStorage.removeItem(PENDING_INVITE_KEY);
  }, [data]);

  const skip = () => {
    localStorage.removeItem(PENDING_INVITE_KEY);
    setLocation("/");
  };

  const accept = useMutation({
    mutationFn: () =>
      customFetch<{ institutionName: string }>(`/api/invites/${token}/accept`, {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: () => {
      localStorage.removeItem(PENDING_INVITE_KEY);
      // Ricarica per rileggere ruolo e appartenenze aggiornati.
      window.location.assign("/cattedra");
    },
    onError: (err: any) => setError(err?.data?.error ?? "Non è stato possibile accettare l'invito."),
  });

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-[460px] max-w-full shadow-lg">
        <CardHeader className="text-center">
          <div className="mb-2 flex justify-center">
            <Logo className="text-primary" size="lg" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">{children}</CardContent>
      </Card>
    </div>
  );

  if (isLoading || !isLoaded) {
    return (
      <Frame>
        <Skeleton className="h-6 w-48 mx-auto" />
        <Skeleton className="h-24 w-full" />
      </Frame>
    );
  }

  if (isError || !data) {
    return (
      <Frame>
        <div className="text-center space-y-2">
          <XCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h1 className="font-display text-xl font-semibold">Invito non trovato</h1>
          <p className="text-sm text-muted-foreground">
            Il link potrebbe essere errato o non più valido.
          </p>
          <Link href="/" className="text-sm text-primary hover:underline">
            Torna alla home
          </Link>
        </div>
      </Frame>
    );
  }

  const roleLabel = data.role === "amministratore" ? "Amministratore" : "Docente";

  return (
    <Frame>
      <div className="text-center space-y-1">
        <h1 className="font-display text-2xl font-semibold text-primary">Sei stato invitato</h1>
        <p className="text-muted-foreground">
          {data.inviterName ? `${data.inviterName} ti invita` : "Ti hanno invitato"} a entrare in Sillabo.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 shrink-0 text-secondary" />
          <div>
            <div className="font-medium">{data.institutionName}</div>
            <div className="text-sm text-muted-foreground">{data.city}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Star className="h-5 w-5 shrink-0 text-secondary" />
          <div className="text-sm">
            Entrerai come <span className="font-medium">{roleLabel}</span>
          </div>
        </div>
        {data.className && (
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 shrink-0 text-secondary" />
            <div className="text-sm">
              Nella classe <span className="font-medium">{data.className}</span>
              {data.subject && <> per <span className="font-medium">{data.subject}</span></>}
            </div>
          </div>
        )}
      </div>

      {data.status !== "pending" ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900">
            {STATUS_MESSAGE[data.status]}
          </div>
          <Button variant="outline" className="w-full" onClick={skip}>
            Vai alla piattaforma
          </Button>
        </div>
      ) : isSignedIn ? (
        <div className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Attivazione...</>
            ) : (
              "Accetta e entra"
            )}
          </Button>
          <button type="button" onClick={skip} className="w-full text-center text-xs text-muted-foreground hover:underline">
            Salta e vai alla piattaforma
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-center text-sm text-muted-foreground">
            Crea un account (o accedi) per completare l'attivazione.
          </p>
          <Button className="w-full" onClick={() => setLocation("/sign-up")}>
            Registrati
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setLocation("/sign-in")}>
            <LogIn className="mr-2 h-4 w-4" />
            Ho già un account
          </Button>
        </div>
      )}
    </Frame>
  );
}
