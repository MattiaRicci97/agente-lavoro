import { useEffect, useState } from "react";
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
  Stamp,
  KeyRound,
  Megaphone,
  ClipboardList,
  Gavel,
  Target,
  LifeBuoy,
  Grid3x3,
  LineChart,
  Menu,
  X,
  Compass,
  ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useListJoinRequests, customFetch } from "@sillabo/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useInstitutionProfile } from "@/lib/institutionProfile";

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
  const { shows, terms } = useInstitutionProfile();
  const myGroups = terms.group === "corso" ? "I miei corsi" : "Le mie classi";
  const { data: requests } = useListJoinRequests();
  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  const { data: validations } = useQuery({
    queryKey: ["validationsPending"],
    queryFn: () => customFetch<{ total: number }>("/api/validations/pending", { responseType: "json" }),
  });
  const toValidateCount = validations?.total ?? 0;

  // Su telefono il menu e' a scomparsa: si apre dal pulsante in alto e si
  // richiude da solo quando si cambia pagina.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-card/95 px-4 backdrop-blur md:hidden">
        <Link href="/cattedra">
          <div className="flex cursor-pointer items-center gap-2">
            <Logo className="text-primary" size="md" />
          </div>
        </Link>
        <Button variant="ghost" size="icon" className="relative" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? "Chiudi il menu" : "Apri il menu"}>
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          {!menuOpen && toValidateCount + pendingCount > 0 ? (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-secondary" />
          ) : null}
        </Button>
      </div>
      <aside
        className={cn(
          "w-full flex-col border-r border-border/70 bg-card/80 backdrop-blur md:flex md:w-64",
          menuOpen ? "fixed inset-x-0 bottom-0 top-14 z-20 flex overflow-y-auto bg-card" : "hidden",
        )}
      >
        <div className="hidden border-b border-border/60 p-5 md:block">
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
          <NavItem href="/cattedra/classi" icon={GraduationCap} label={myGroups} active={location === "/cattedra/classi"} />
          <NavItem href="/cattedra/bacheca" icon={Megaphone} label="Bacheca" active={location === "/cattedra/bacheca"} />
          {shows("registro") && (
            <NavItem href="/cattedra/registro" icon={ClipboardList} label="Registro" active={location.startsWith("/cattedra/registro")} />
          )}
          {shows("scrutinio") && <NavItem href="/cattedra/scrutinio" icon={Gavel} label="Scrutinio" active={location === "/cattedra/scrutinio"} />}
          <NavItem href="/cattedra/obiettivi" icon={Target} label="Obiettivi" active={location === "/cattedra/obiettivi"} />
          <NavItem
            href="/cattedra/validazioni"
            icon={Stamp}
            label="Da validare"
            active={location === "/cattedra/validazioni"}
            badge={toValidateCount}
          />
          <NavItem href="/cattedra/recupero" icon={LifeBuoy} label="Recupero" active={location === "/cattedra/recupero"} />
          <NavItem href="/cattedra/mappa" icon={Grid3x3} label={`Mappa ${terms.group === "corso" ? "del corso" : "della classe"}`} active={location === "/cattedra/mappa"} />
          <NavItem href="/cattedra/attivita" icon={Compass} label="Attività guidate" active={location === "/cattedra/attivita"} />
          {shows("invalsi") && (
            <NavItem href="/cattedra/invalsi" icon={ListChecks} label="Allenamento INVALSI" active={location === "/cattedra/invalsi"} />
          )}
          <NavItem href="/cattedra/assistente" icon={Sparkles} label="Assistente" active={location === "/cattedra/assistente"} />

          <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Gestione
          </div>
          <NavItem href="/cattedra/istituto" icon={Building2} label="Istituto" active={location === "/cattedra/istituto"} />
          <NavItem href="/cattedra/efficacia" icon={LineChart} label="Efficacia" active={location === "/cattedra/efficacia"} />
          <NavItem href="/cattedra/licenza" icon={KeyRound} label="Licenza e utenze" active={location === "/cattedra/licenza"} />
          {shows("moduli") && <NavItem href="/cattedra/moduli" icon={LayoutGrid} label="Moduli" active={location === "/cattedra/moduli"} />}
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

      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
