import { Link, useLocation } from "wouter";
import {
  BarChart3,
  LogOut,
  Building2,
  LayoutGrid,
  Inbox,
  GraduationCap,
  UserCircle,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useListJoinRequests } from "@sillabo/api-client-react";
import { cn } from "@/lib/utils";

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "group hover-elevate relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-secondary transition-opacity",
            active ? "opacity-100" : "opacity-0",
          )}
        />
        <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-secondary")} />
        <span className="flex-1">{label}</span>
        {badge && badge > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-xs font-semibold text-secondary-foreground">
            {badge}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();
  const { data: requests } = useListJoinRequests();
  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row">
      <aside className="flex w-full flex-col border-r border-border/70 bg-card/80 backdrop-blur md:w-64">
        <div className="border-b border-border/60 p-5">
          <Link href="/">
            <div className="flex cursor-pointer items-center gap-2">
              <Logo className="text-primary" size="md" />
            </div>
          </Link>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">
            Cattedra
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <div className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Insegnamento
          </div>
          <NavItem href="/cattedra" icon={BarChart3} label="Panoramica" active={location === "/cattedra"} />
          <NavItem href="/cattedra/classi" icon={GraduationCap} label="Le mie classi" active={location === "/cattedra/classi"} />
          <NavItem href="/cattedra/assistente" icon={Sparkles} label="Assistente" active={location === "/cattedra/assistente"} />

          <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Gestione
          </div>
          <NavItem href="/cattedra/istituto" icon={Building2} label="Istituto" active={location === "/cattedra/istituto"} />
          <NavItem href="/cattedra/moduli" icon={LayoutGrid} label="Moduli" active={location === "/cattedra/moduli"} />
          <NavItem
            href="/cattedra/richieste"
            icon={Inbox}
            label="Richieste"
            active={location === "/cattedra/richieste"}
            badge={pendingCount}
          />
        </nav>

        <div className="space-y-1 border-t border-border/60 p-3">
          <NavItem href="/cattedra/profilo" icon={UserCircle} label="Profilo" active={location === "/cattedra/profilo"} />
          <Button
            variant="ghost"
            className="w-full justify-start px-3 text-muted-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="mr-3 h-[18px] w-[18px]" />
            Esci
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
