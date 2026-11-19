"use client";

import {
  BedDouble,
  Backpack,
  Ellipsis,
  Home,
  MapPinned,
  Plane,
  Route,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Board } from "@/components/ui/flap-digits";
import { Sheet } from "@/components/ui/sheet";
import { daysToGo, localISODate } from "@/lib/calc";
import { useActiveTrip } from "@/lib/queries/trip";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Desktop rail shows all of these. Phones show the first five as tabs and the rest behind "More". */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/itinerary", label: "Itinerary", icon: Route },
  { href: "/places", label: "Places", icon: MapPinned },
  { href: "/stays", label: "Stays", icon: BedDouble },
  { href: "/flights", label: "Flights", icon: Plane },
  { href: "/spend", label: "Spend", icon: Wallet },
  { href: "/pack", label: "Pack", icon: Backpack },
];
const TABS = NAV.slice(0, 5);
const MORE: NavItem[] = [...NAV.slice(5), { href: "/settings", label: "Settings", icon: Settings }];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop rail header: the trip's name with a board counter. Renders nothing until a trip is loaded. */
function RailTrip() {
  const trip = useActiveTrip().data;
  const today = useClientValue(localISODate, null);
  if (!trip) return null;
  const c = today ? daysToGo(today, trip.start_date, trip.end_date) : null;
  const [value, caption] =
    !c || c.kind === "unset"
      ? ["–", "dates not set"]
      : c.kind === "before"
        ? [String(c.n), c.n === 1 ? "day to go" : "days to go"]
        : c.kind === "during"
          ? [String(c.n), `of ${c.of} days`]
          : ["✓", "trip completed"];
  return (
    <Link
      href="/"
      className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-line"
    >
      <Board value={value} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-display text-base leading-tight font-extrabold">{trip.name}</span>
        <span className="text-sm text-fg-muted">{caption}</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-[11px] bg-ink text-ground" aria-hidden>
            <MapPinned className="size-5" />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">Trip Planner</span>
        </div>
        {isSupabaseConfigured() && <RailTrip />}
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <RailLink key={href} href={href} label={label} icon={Icon} active={isActive(pathname, href)} />
          ))}
          <div className="mt-auto">
            <RailLink href="/settings" label="Settings" icon={Settings} active={isActive(pathname, "/settings")} />
          </div>
        </nav>
      </aside>

      <main
        id="main"
        className="mx-auto w-full max-w-[1040px] flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(var(--tabbar-h)+1.5rem)] lg:px-10 lg:pt-16 lg:pb-12"
      >
        {children}
      </main>

      {/* Mobile bottom tab bar: five tabs and "More" */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-6">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors",
                    active ? "text-fg" : "text-fg-muted",
                  )}
                >
                  <TabPill active={active}>
                    <Icon className="size-[22px]" aria-hidden />
                  </TabPill>
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-current={moreActive ? "page" : undefined}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors",
                moreActive ? "text-fg" : "text-fg-muted",
              )}
            >
              <TabPill active={moreActive}>
                <Ellipsis className="size-[22px]" aria-hidden />
              </TabPill>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="More">
        <ul className="pb-2">
          {MORE.map(({ href, label, icon: Icon }) => (
            <li key={href} className="border-t border-border first:border-t-0">
              <Link
                href={href}
                onClick={() => setMoreOpen(false)}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex min-h-14 items-center gap-3.5 text-[17px] font-bold"
              >
                <Icon className="size-[22px] text-fg-muted" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

function TabPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "grid h-[30px] w-11 place-items-center rounded-full transition-colors",
        active && "bg-teal-tint text-teal",
      )}
    >
      {children}
    </span>
  );
}

function RailLink({ href, label, icon: Icon, active }: NavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 font-bold transition-colors",
        active ? "bg-teal-tint text-teal" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
