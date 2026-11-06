"use client";

import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { STATUSES, type Status } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Status → chip style. Text always carries the meaning; colour is a second cue. */
const STYLE: Record<Status, string> = {
  Idea: "bg-surface-2 text-fg-muted ring-border",
  Maybe: "bg-surface-2 text-fg-muted ring-border border-dashed",
  Planned: "bg-[#3d5a99]/12 text-[#2c4478] ring-[#3d5a99]/30 dark:text-[#a9bdf0]",
  Priced: "bg-gold/25 text-ink ring-gold/60 dark:text-gold",
  Booked: "bg-teal/15 text-teal ring-teal/40",
  Done: "bg-teal text-teal-ink ring-teal",
  Cancelled: "bg-surface-2 text-fg-muted line-through ring-border",
};

export function statusStyle(status: string) {
  return STYLE[(STATUSES as readonly string[]).includes(status) ? (status as Status) : "Planned"];
}

/** Read-only chip. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset",
        statusStyle(status),
        className,
      )}
    >
      {status}
    </span>
  );
}

/** Tappable chip: opens the status list (44px tap target around a compact chip). */
export function StatusChip({
  status,
  onChange,
  label,
}: {
  status: string;
  onChange: (s: Status) => void;
  label: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="-my-2 inline-flex min-h-11 shrink-0 items-center rounded-full outline-offset-0"
        aria-label={`${label}: ${status}. Change status`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-xs font-semibold ring-1 ring-inset",
            statusStyle(status),
          )}
        >
          {status}
          <ChevronDown className="size-3.5 opacity-70" aria-hidden />
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-40 rounded-2xl border border-border bg-surface p-1.5 shadow-card"
          onClick={(e) => e.stopPropagation()}
        >
          {STATUSES.map((s) => (
            <DropdownMenu.Item
              key={s}
              onSelect={() => onChange(s)}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none data-[highlighted]:bg-surface-2"
            >
              <span className="w-4">{s === status && <Check className="size-4 text-teal" aria-hidden />}</span>
              {s}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
