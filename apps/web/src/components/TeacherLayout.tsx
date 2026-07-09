import { Link, useLocation } from "wouter";
import { BarChart3, LogOut, Building2, LayoutGrid, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useListJoinRequests } from "@sillabo/api-client-react";

export function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();
  const { data: requests } = useListJoinRequests();
  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-card border-r flex flex-col">
        <div className="p-6 border-b">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Logo className="text-primary" size="md" />
            </div>
          </Link>
          <div className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cattedra</div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/cattedra">
            <Button variant={location === "/cattedra" ? "secondary" : "ghost"} className="w-full justify-start">
              <BarChart3 className="mr-2 h-4 w-4" />
              Panoramica
            </Button>
          </Link>
          <Link href="/cattedra/istituto">
            <Button variant={location === "/cattedra/istituto" ? "secondary" : "ghost"} className="w-full justify-start">
              <Building2 className="mr-2 h-4 w-4" />
              Istituto
            </Button>
          </Link>
          <Link href="/cattedra/moduli">
            <Button variant={location === "/cattedra/moduli" ? "secondary" : "ghost"} className="w-full justify-start">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Moduli
            </Button>
          </Link>
          <Link href="/cattedra/richieste">
            <Button variant={location === "/cattedra/richieste" ? "secondary" : "ghost"} className="w-full justify-start relative">
              <Inbox className="mr-2 h-4 w-4" />
              Richieste
              {pendingCount > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </Button>
          </Link>
        </nav>

        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Esci
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
