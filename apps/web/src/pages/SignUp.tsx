import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MailCheck } from "lucide-react";

export default function SignUp() {
  const { signUp } = useAuth();
  const [, setLocation] = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error, needsEmailConfirmation } = await signUp(fullName.trim(), email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    setLocation("/");
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
        <Card className="w-[440px] max-w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <MailCheck className="h-10 w-10 text-primary" />
            </div>
            <CardTitle>Controlla la tua email</CardTitle>
            <CardDescription>
              Ti abbiamo inviato un link di conferma a <strong>{email}</strong>. Aprilo per attivare
              il tuo account, poi torna qui e accedi.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/sign-in" className="text-primary hover:underline text-sm">
              Vai alla pagina di accesso
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-[440px] max-w-full shadow-lg">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <Logo className="text-primary" size="lg" />
          </div>
          <CardTitle className="font-display text-2xl">Crea il tuo account</CardTitle>
          <CardDescription>Inizia subito con Sillabo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome e cognome</Label>
              <Input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Almeno 6 caratteri.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrati
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Hai gia' un account?{" "}
            <Link href="/sign-in" className="text-primary hover:underline">
              Accedi
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
