"use client";

import {
  Banknote,
  BedDouble,
  CalendarClock,
  Check,
  Clock,
  CloudRain,
  Coins,
  Flag,
  Footprints,
  Landmark,
  ListChecks,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Timer,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { Idea } from "@/lib/drafts";
import { cardChips, detailRows } from "@/lib/idea-details";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Banknote,
  BedDouble,
  CalendarClock,
  Check,
  Clock,
  CloudRain,
  Coins,
  Footprints,
  Landmark,
  ListChecks,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Timer,
  Utensils,
};

/** The 2 or 3 most useful facts for this idea (price and length, or a booking that still needs doing). */
export function IdeaChips({ idea, currency, className }: { idea: Idea; currency: string; className?: string }) {
  const chips = cardChips(idea, currency);
  if (chips.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Key facts">
      {chips.map((c) => {
        const Icon = ICONS[c.icon] ?? Check;
        return (
          <li
            key={c.key}
            className={cn(
              "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold",
              c.tone === "ok" && "bg-teal-tint text-teal",
              c.tone === "warn" && "bg-warn-tint text-warn-text",
              !c.tone && "bg-surface-2 text-fg",
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
            {c.label}
          </li>
        );
      })}
    </ul>
  );
}

/** The owner's "Deal-breaker / must-do" flag. */
export function MustFlag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full bg-[var(--accent-tint)] px-2.5 text-xs font-extrabold text-[var(--accent-text)]",
        className,
      )}
    >
      <Flag className="size-3" strokeWidth={2.8} aria-hidden />
      Must-do
    </span>
  );
}

/** Every filled-in field as label / value rows. Read-only, so viewers see the same details the owner typed. */
export function DetailsList({ idea }: { idea: Idea }) {
  const rows = detailRows(idea);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Details" className="space-y-2">
      <h3 className="font-display text-[17px] font-extrabold">Details</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-fg-muted">{r.label}</dt>
            <dd className="font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
