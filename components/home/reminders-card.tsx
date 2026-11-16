"use client";

import { BedDouble, BellRing, CalendarClock, ChevronRight, ShieldCheck, Ticket, TriangleAlert, Utensils, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTrip } from "@/components/trip-gate";
import { Card, CardTitle } from "@/components/ui/card";
import { localISODate } from "@/lib/calc";
import { useIdeas } from "@/lib/queries/ideas";
import { useRows } from "@/lib/queries/table";
import { autoReminders, type ReminderIcon } from "@/lib/reminders";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";

const ICON: Record<ReminderIcon, LucideIcon> = {
  BedDouble,
  ShieldCheck,
  CalendarClock,
  Ticket,
  TriangleAlert,
  Utensils,
};
const MAX_SHOWN = 5;

/* ---------- dismissals: kept on this device only, so no database and no cost ---------- */
const listeners = new Set<() => void>();
const storageKey = (tripId: string) => `tp-dismissed-reminders:${tripId}`;
const read = (tripId: string) => {
  try {
    return localStorage.getItem(storageKey(tripId)) ?? "";
  } catch {
    return ""; // private window or blocked storage: nothing is remembered, the reminders just stay
  }
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

function useDismissed(tripId: string) {
  // The server snapshot is empty, so the first browser render matches the server HTML.
  const raw = useSyncExternalStore(subscribe, () => read(tripId), () => "");
  const dismissed = new Set(raw ? raw.split("\n") : []);
  const dismiss = (id: string) => {
    try {
      localStorage.setItem(storageKey(tripId), [...dismissed, id].slice(-200).join("\n"));
    } catch {
      // nothing to do: it simply comes back next time
    }
    listeners.forEach((l) => l());
  };
  return { dismissed, dismiss };
}

/**
 * Home: what needs doing soon. Reminders worked out from the plan (a check-in, a cancellation deadline, a stay
 * that is not booked, tickets or a table still to book) come first and can be dismissed on this device; the
 * owner's own notes from Pack follow. Nothing shows until there is something to say.
 */
export function RemindersCard() {
  const trip = useTrip();
  const stays = useRows("stays");
  const notes = useRows("reminders");
  const itinerary = useRows("itinerary_items");
  const { ideas, isPending } = useIdeas();
  const today = useClientValue(() => localISODate(), null);
  const { dismissed, dismiss } = useDismissed(trip.id);

  if (!stays.isSuccess || !notes.isSuccess || !itinerary.isSuccess || isPending || !today) return null;

  const auto = autoReminders({ stays: stays.data, ideas, items: itinerary.data, start: trip.start_date }, today).filter((r) => !dismissed.has(r.id));
  const mine = notes.data;
  if (auto.length === 0 && mine.length === 0) return null;

  const shown = auto.slice(0, MAX_SHOWN);
  const room = MAX_SHOWN - shown.length;
  const more = auto.length - shown.length + Math.max(0, mine.length - room);

  return (
    <Card className="px-3.5 py-1.5 lg:px-4" aria-label="Reminders">
      <div className="flex items-center justify-between">
        <CardTitle className="pt-2.5 pb-1">Reminders</CardTitle>
        <Link href="/pack?tab=reminders" className="inline-flex min-h-11 items-center text-sm font-bold text-teal">
          All
        </Link>
      </div>
      <ul>
        {shown.map((r) => {
          const Icon = ICON[r.icon];
          return (
            <li key={r.id} className="flex items-center gap-1 border-t border-border first:border-t-0">
              <Link href={r.href} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-1.5">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl",
                    r.tone === "due" ? "bg-[var(--accent-tint)] text-[var(--accent-text)]" : "bg-warn-tint text-warn-text",
                  )}
                  aria-hidden
                >
                  <Icon className="size-[18px]" strokeWidth={2.4} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] leading-tight font-bold">{r.title}</span>
                  <span className="line-clamp-2 text-[13px] text-fg-muted">{r.detail}</span>
                </span>
                <ChevronRight className="ml-auto size-[18px] shrink-0 text-fg-muted" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => dismiss(r.id)}
                aria-label={`Dismiss: ${r.title}, ${r.detail}`}
                className="-mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-surface-2"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </li>
          );
        })}
        {mine.slice(0, Math.max(0, room)).map((n) => (
          <li key={n.id} className="flex min-h-12 items-center gap-3 border-t border-border py-1.5 text-[15px]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-muted" aria-hidden>
              <BellRing className="size-[18px]" strokeWidth={2.4} />
            </span>
            <span className="min-w-0 break-words">{n.text}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href="/pack?tab=reminders" className="flex min-h-11 items-center border-t border-border text-sm font-bold text-teal">
          +{more} more
        </Link>
      )}
    </Card>
  );
}
