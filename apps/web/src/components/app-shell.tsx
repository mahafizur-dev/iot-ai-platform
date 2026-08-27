"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, Cpu, LayoutDashboard, LogOut, Radio, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/devices", label: "Devices", icon: Cpu, exact: false },
  { href: "/alerts", label: "Alerts", icon: BellRing, exact: true },
  { href: "/alert-rules", label: "Alert rules", icon: SlidersHorizontal, exact: true },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Chrome for every authenticated screen. `/login` opts out — it renders before
 * there is a user to put in the sidebar, and a nav the visitor can't use is
 * just noise.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <Radio className="size-5 text-primary" aria-hidden />
          <span className="font-semibold tracking-tight">IoT AI Platform</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href, exact) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, href, exact)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <p className="px-5 pb-4 text-xs text-muted-foreground">
          Analytics and the AI assistant arrive in later phases.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b bg-card px-6">
          <nav className="flex items-center gap-4 md:hidden" aria-label="Main (compact)">
            {NAV.map(({ href, label, exact }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "text-sm font-medium",
                  isActive(pathname, href, exact) ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden md:block" />

          <div className="flex items-center gap-1">
            {user && <NotificationBell />}
            <ThemeToggle />

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {initials(user.name || user.email)}
                    </span>
                    <span className="hidden max-w-40 truncate sm:inline">{user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate">{user.name || user.email}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {user.roles.join(", ") || "no roles"}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>
                    <LogOut aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
