import { Link, useLocation } from "wouter";
import { LogOut, BookMarked, CalendarClock, UserCircle, PiggyBank, ScanLine, Megaphone, MessagesSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

function NavLink({
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
  short?: string;
}) {
  return (
    <Link href={href}>
      <div
        title={label}
        className={cn(
          "hover-elevate relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-secondary/12 text-secondary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden lg:inline">{label}</span>
        {badge && badge > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-semibold text-secondary-foreground">
            {badge}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function StudentLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();

  const { data: unread } = useQuery({
    queryKey: ["unreadPosts"],
    queryFn: () => customFetch<{ unread: number }>("/api/class-posts/unread-count", { responseType: "json" }),
  });

  const items = [
    { href: "/studio", icon: BookMarked, label: "Materiali", active: location === "/studio" || location.startsWith("/studio/material") },
    { href: "/studio/bacheca", icon: Megaphone, label: "Bacheca", active: location === "/studio/bacheca", badge: unread?.unread ?? 0 },
    { href: "/studio/corso", icon: MessagesSquare, label: "Chiedi al corso", short: "Corso", active: location === "/studio/corso" },
    { href: "/studio/ripasso", icon: CalendarClock, label: "Ripasso", active: location === "/studio/ripasso" || location === "/studio/lampo" },
    { href: "/studio/foto", icon: ScanLine, label: "Correggi", active: location === "/studio/foto" },
    { href: "/studio/finanza", icon: PiggyBank, label: "Finanza", active: location.startsWith("/studio/finanza") },
    { href: "/studio/profilo", icon: UserCircle, label: "Profilo", active: location === "/studio/profilo" },
  ];

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
            <div className="hidden items-center gap-1 sm:flex">
              {items.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>
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

      <main className="container mx-auto flex-1 px-4 py-8 pb-24 sm:pb-8">{children}</main>

      {/* Su telefono la navigazione sta in basso, a portata di pollice, come in un'app. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-border/60 bg-card/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 px-1.5 py-2 text-[10px] font-medium",
                item.active ? "text-secondary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.short ?? item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="absolute right-0.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-semibold text-secondary-foreground">
                  {item.badge}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
