import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { setAuthTokenGetter } from "@sillabo/api-client-react";
import { supabase } from "./supabase";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
}

interface AuthContextValue {
  /** null = non autenticato; undefined mai (usare isLoaded) */
  user: AuthUser | null;
  session: Session | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : null,
  };
}

// Il client API allega automaticamente il token della sessione Supabase
// a ogni chiamata verso /api.
setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoaded(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setIsLoaded(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: toAuthUser(session?.user ?? null),
      session,
      isLoaded,
      isSignedIn: !!session,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? translateAuthError(error.message) : null };
      },
      signUp: async (fullName, email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) {
          return { error: translateAuthError(error.message), needsEmailConfirmation: false };
        }
        // Se la conferma email e' attiva, Supabase non restituisce una sessione.
        return { error: null, needsEmailConfirmation: !data.session };
      },
      signOut: async (options) => {
        await supabase.auth.signOut();
        if (options?.redirectUrl) {
          window.location.assign(options.redirectUrl);
        }
      },
    }),
    [session, isLoaded],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}

function translateAuthError(message: string): string {
  const map: Array<[RegExp, string]> = [
    [/invalid login credentials/i, "Email o password non corretti"],
    [/user already registered/i, "Esiste gia' un account con questa email"],
    [/password should be at least/i, "La password deve avere almeno 6 caratteri"],
    [/email not confirmed/i, "Devi prima confermare la tua email: controlla la casella di posta"],
    [/unable to validate email/i, "Indirizzo email non valido"],
    [/rate limit/i, "Troppi tentativi: riprova tra qualche minuto"],
  ];
  for (const [re, translated] of map) {
    if (re.test(message)) return translated;
  }
  return message;
}
