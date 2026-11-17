"use client";

import { Check, CircleHelp, ThumbsUp, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { VOTE_LABEL, type VoteValue } from "@/lib/drafts";
import { cn } from "@/lib/utils";

const ICON = { in: Check, maybe: CircleHelp, pass: X } as const;
const ON: Record<VoteValue, string> = {
  in: "bg-teal text-teal-ink",
  maybe: "bg-warn-tint text-warn-text ring-[1.5px] ring-warn",
  pass: "bg-ink text-ground",
};

/** One-tap vote. Tapping the vote you already made clears it. Never disabled, never a dead button. */
export function VoteButtons({
  value,
  onVote,
  label,
}: {
  value: VoteValue | null;
  onVote: (v: VoteValue | null) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-1.5">
      {(["in", "maybe", "pass"] as VoteValue[]).map((v) => {
        const on = value === v;
        const Icon = ICON[v];
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onVote(on ? null : v)}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] text-[15px] font-bold transition-colors",
              on ? ON[v] : "bg-surface-2 text-fg hover:bg-line",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={on ? 2.8 : 2.4} aria-hidden />
            {VOTE_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

const MENU_TEXT: Record<VoteValue, string> = { in: "text-teal", maybe: "text-warn-text", pass: "text-danger" };
const MENU_FILL: Record<VoteValue, string> = { in: "bg-teal-tint text-teal", maybe: "bg-warn-tint text-warn-text", pass: "bg-danger-tint text-danger" };

/**
 * A small Vote button for a card. Closed it says "Vote", or "Voted" in the colour of the vote already cast; it opens
 * I’m in | Maybe | Pass. Choosing the vote you already have clears it.
 */
export function VoteMenu({ value, onVote, label }: { value: VoteValue | null; onVote: (v: VoteValue | null) => void; label: string }) {
  const Current = value ? ICON[value] : ThumbsUp;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-colors",
          value ? MENU_FILL[value] : "bg-surface-2 text-fg hover:bg-line",
        )}
      >
        <Current className="size-4" strokeWidth={2.6} aria-hidden />
        {value ? `Voted · ${VOTE_LABEL[value]}` : "Vote"}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-[60] min-w-44 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
          {(["in", "maybe", "pass"] as VoteValue[]).map((v) => {
            const Icon = ICON[v];
            return (
              <DropdownMenu.CheckboxItem
                key={v}
                checked={value === v}
                onCheckedChange={() => onVote(value === v ? null : v)}
                className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-bold outline-none data-[highlighted]:bg-surface-2", value === v && MENU_FILL[v])}
              >
                <Icon className={cn("size-4", value !== v && MENU_TEXT[v])} strokeWidth={2.8} aria-hidden />
                {VOTE_LABEL[v]}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
