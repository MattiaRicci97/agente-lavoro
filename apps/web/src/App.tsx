import { useEffect, useRef } from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@sillabo/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Onboarding from "./pages/Onboarding";
import JoinClass from "./pages/JoinClass";
import CattedraDashboard from "./pages/CattedraDashboard";
import CattedraClassi from "./pages/CattedraClassi";
import CattedraNuovo from "./pages/CattedraNuovo";
import CattedraMaterial from "./pages/CattedraMaterial";
import CattedraIstituto from "./pages/CattedraIstituto";
import CattedraModuli from "./pages/CattedraModuli";
import CattedraRichieste from "./pages/CattedraRichieste";
import StudioDashboard from "./pages/StudioDashboard";
import StudioQuiz from "./pages/StudioQuiz";
import StudioOrale from "./pages/StudioOrale";
import StudioScritto from "./pages/StudioScritto";
import StudioRipasso from "./pages/StudioRipasso";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient();

function AuthQueryCacheInvalidator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      queryClient.clear();
    }
    prevUserIdRef.current = userId;
  }, [user?.id, queryClient]);

  return null;
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Skeleton className="h-10 w-40" />
    </div>
  );
}

function TeacherGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: me, isLoading } = useGetMe({ query: { enabled: isSignedIn, queryKey: getGetMeQueryKey() } });

  if (!isLoaded || (isSignedIn && isLoading)) return <FullScreenLoader />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (!me) return <FullScreenLoader />;
  if (!me.role) return <Redirect to="/onboarding" />;
  if (me.role !== "docente") return <Redirect to="/studio" />;

  return <>{children}</>;
}

function StudentGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: me, isLoading } = useGetMe({ query: { enabled: isSignedIn, queryKey: getGetMeQueryKey() } });

  if (!isLoaded || (isSignedIn && isLoading)) return <FullScreenLoader />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (!me) return <FullScreenLoader />;
  if (!me.role) return <Redirect to="/onboarding" />;
  if (me.role !== "studente") return <Redirect to="/cattedra" />;
  if (me.studentMemberships.length === 0) return <Redirect to="/entra-in-classe" />;

  return <>{children}</>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <FullScreenLoader />;
  if (!isSignedIn) return <Home />;
  return <PostLoginRedirect />;
}

function PostLoginRedirect() {
  const { data: me, isLoading } = useGetMe();

  if (isLoading || !me) return <FullScreenLoader />;
  if (!me.role) return <Redirect to="/onboarding" />;
  if (me.role === "docente") return <Redirect to="/cattedra" />;
  if (me.studentMemberships.length > 0) return <Redirect to="/studio" />;
  return <Redirect to="/entra-in-classe" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignIn} />
      <Route path="/sign-up" component={SignUp} />

      <Route path="/onboarding">
        <AuthedAllowUnroledGate>
          <Onboarding />
        </AuthedAllowUnroledGate>
      </Route>

      <Route path="/entra-in-classe">
        <StudentJoinGate>
          <JoinClass />
        </StudentJoinGate>
      </Route>

      <Route path="/cattedra">
        <TeacherGate>
          <CattedraDashboard />
        </TeacherGate>
      </Route>
      <Route path="/cattedra/classi">
        <TeacherGate>
          <CattedraClassi />
        </TeacherGate>
      </Route>
      <Route path="/cattedra/nuovo">
        <TeacherGate>
          <CattedraNuovo />
        </TeacherGate>
      </Route>
      <Route path="/cattedra/material/:id">
        <TeacherGate>
          <CattedraMaterial />
        </TeacherGate>
      </Route>
      <Route path="/cattedra/istituto">
        <TeacherGate>
          <CattedraIstituto />
        </TeacherGate>
      </Route>
      <Route path="/cattedra/moduli">
        <TeacherGate>
          <CattedraModuli />
        </TeacherGate>
      </Route>
      <Route path="/cattedra/richieste">
        <TeacherGate>
          <CattedraRichieste />
        </TeacherGate>
      </Route>

      <Route path="/studio">
        <StudentGate>
          <StudioDashboard />
        </StudentGate>
      </Route>
      <Route path="/studio/ripasso">
        <StudentGate>
          <StudioRipasso />
        </StudentGate>
      </Route>
      <Route path="/studio/material/:id/quiz">
        <StudentGate>
          <StudioQuiz />
        </StudentGate>
      </Route>
      <Route path="/studio/material/:id/orale">
        <StudentGate>
          <StudioOrale />
        </StudentGate>
      </Route>
      <Route path="/studio/material/:id/scritto">
        <StudentGate>
          <StudioScritto />
        </StudentGate>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function AuthedAllowUnroledGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: me, isLoading } = useGetMe({ query: { enabled: isSignedIn, queryKey: getGetMeQueryKey() } });

  if (!isLoaded || (isSignedIn && isLoading)) return <FullScreenLoader />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (me?.role) return <Redirect to="/" />;

  return <>{children}</>;
}

function StudentJoinGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: me, isLoading } = useGetMe({ query: { enabled: isSignedIn, queryKey: getGetMeQueryKey() } });

  if (!isLoaded || (isSignedIn && isLoading)) return <FullScreenLoader />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (!me) return <FullScreenLoader />;
  if (!me.role) return <Redirect to="/onboarding" />;
  if (me.role !== "studente") return <Redirect to="/cattedra" />;
  if (me.studentMemberships.length > 0) return <Redirect to="/studio" />;

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AuthQueryCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
