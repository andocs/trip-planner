"use client";

import { Check, CircleHelp, X } from "lucide-react";
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
