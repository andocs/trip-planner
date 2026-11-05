"use client";

import { Backpack, Home, MapPinned, Route, Settings, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/spend", label: "Spend", icon: Wallet },
  { href: "/plan", label: "Plan", icon: Route },
  { href: "/places", label: "Places", icon: MapPinned },
  { href: "/pack", label: "Pack", icon: Backpack },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-navy text-white" aria-hidden>
            <MapPinned className="size-5" />
          </span>
          <span className="text-lg font-bold">Trip Planner</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {[...NAV, { href: "/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main
        id="main"
        className="mx-auto w-full max-w-5xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(var(--tabbar-h)+1.5rem)] lg:px-8 lg:pt-8 lg:pb-12"
      >
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors",
                    active ? "text-primary" : "text-fg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-12 place-items-center rounded-full transition-colors",
                      active && "bg-primary/12",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
