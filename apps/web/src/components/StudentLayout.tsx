import { Link, useLocation } from "wouter";
import { LogOut, BookMarked, CalendarClock, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

export function StudentLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Logo className="text-secondary" size="md" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-2">Studio</span>
            </div>
          </Link>

          <nav className="flex items-center gap-4">
            <Link href="/studio">
              <Button variant={location === "/studio" ? "secondary" : "ghost"}>
                <BookMarked className="mr-2 h-4 w-4" />
                Materiali
              </Button>
            </Link>
            <Link href="/studio/ripasso">
              <Button variant={location === "/studio/ripasso" ? "secondary" : "ghost"}>
                <CalendarClock className="mr-2 h-4 w-4" />
                Piano di ripasso
              </Button>
            </Link>
            <Link href="/studio/profilo">
              <Button variant={location === "/studio/profilo" ? "secondary" : "ghost"}>
                <UserCircle className="mr-2 h-4 w-4" />
                Profilo
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
