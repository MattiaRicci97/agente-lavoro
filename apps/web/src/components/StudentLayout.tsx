import { Link, useLocation } from "wouter";
import { LogOut, BookMarked, CalendarClock, UserCircle, PiggyBank, ScanLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "hover-elevate flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-secondary/12 text-secondary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </div>
    </Link>
  );
}

export function StudentLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-card/85 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/">
            <div className="flex cursor-pointer items-center gap-2.5">
              <Logo className="text-secondary" size="md" />
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:inline">
                Studio
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink href="/studio" icon={BookMarked} label="Materiali" active={location === "/studio"} />
            <NavLink href="/studio/ripasso" icon={CalendarClock} label="Ripasso" active={location === "/studio/ripasso"} />
            <NavLink href="/studio/foto" icon={ScanLine} label="Correggi" active={location === "/studio/foto"} />
            <NavLink
              href="/studio/finanza"
              icon={PiggyBank}
              label="Finanza"
              active={location.startsWith("/studio/finanza")}
            />
            <NavLink href="/studio/profilo" icon={UserCircle} label="Profilo" active={location === "/studio/profilo"} />
            <Button
              variant="ghost"
              size="icon"
              className="ml-1 text-muted-foreground"
              onClick={() => signOut({ redirectUrl: "/" })}
              title="Esci"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
