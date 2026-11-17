"use client";

import { Timer } from "lucide-react";
import { CHIP_ICONS } from "@/components/ideas/idea-chips";
import { Sheet } from "@/components/ui/sheet";
import type { Idea } from "@/lib/drafts";
import { stopRows } from "@/lib/itinerary-rows";
import type { Row } from "@/lib/queries/table";

/** A stop, read-only: what a viewer sees when they open a card (editors get the form instead). */
export function StopView({ item, idea, currency, onClose }: { item: Row<"itinerary_items">; idea?: Idea; currency: string; onClose: () => void }) {
  const rows = stopRows(item, idea, currency);
  const note = item.note && !/^https?:\/\//i.test(item.note) ? item.note : null;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={item.activity} description={[item.type, item.city, item.at_time?.slice(0, 5)].filter(Boolean).join(" · ") || undefined}>
      <ul className="pt-2">
        {rows.map((r, n) => {
          const Icon = CHIP_ICONS[r.icon] ?? Timer;
          return (
            <li key={r.label} className={`grid min-h-12 grid-cols-[22px_1fr] items-center gap-2.5 py-1 ${n > 0 ? "border-t border-border" : ""}`}>
              <Icon className="size-[18px] text-teal" strokeWidth={2.4} aria-hidden />
              <span className="min-w-0">
                <b className="block text-sm leading-tight">{r.value}</b>
                <small className="block text-xs text-fg-muted">{r.label}</small>
              </span>
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-3 text-sm whitespace-pre-line text-fg-muted">{note}</p>}
    </Sheet>
  );
}
