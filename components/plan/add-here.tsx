"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The control that belongs to one activity: hidden until the bottom edge of the card is hovered (always shown where
 * there is no hover, such as a phone), then a 44px circle. Hovering, focusing or tapping the circle opens it sideways
 * into one neutral line: Commute | Rest | Activity. Opening is a width change only, and there is none with reduced motion.
 */
export function AddHere({
  label,
  onCommute,
  onRest,
  onActivity,
}: {
  /** The activity it sits under, for the accessible name. */
  label: string;
  onCommute: () => void;
  onRest: () => void;
  onActivity: () => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const option = "min-h-11 border-l border-line-strong px-4 text-sm font-bold whitespace-nowrap hover:bg-surface-2 focus-visible:bg-surface-2";
  return (
    <div
      className={cn(
        "group/add mt-1 flex min-h-11 items-center [@media(hover:none)]:opacity-100",
        open ? "opacity-100" : "opacity-0 focus-within:opacity-100 hover:opacity-100",
      )}
    >
      <div
        role="group"
        aria-label={`After ${label}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={cn(
          "inline-flex h-11 items-center overflow-hidden rounded-full bg-surface shadow-[inset_0_0_0_2px_var(--line-strong)] transition-[max-width] duration-200 motion-reduce:transition-none",
          open ? "max-w-[340px]" : "max-w-11",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Add after ${label}`}
          aria-expanded={open}
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted"
        >
          <Plus className="size-4" strokeWidth={3} aria-hidden />
        </button>
        {open && (
          <>
            <button type="button" onClick={choose(onCommute)} className={option}>
              Commute
            </button>
            <button type="button" onClick={choose(onRest)} className={option}>
              Rest
            </button>
            <button type="button" onClick={choose(onActivity)} className={cn(option, "pr-5")}>
              Activity
            </button>
          </>
        )}
      </div>
    </div>
  );
}
