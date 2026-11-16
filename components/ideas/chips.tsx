"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A row of toggle chips (44px targets). `multi` picks several; otherwise one, and pressing the chosen one again
 * clears it (the field is optional). Built from plain buttons with aria-pressed, so it works with a keyboard and
 * a screen reader without extra wiring.
 */
export function ChipGroup({
  label,
  options,
  value,
  onChange,
  multi = false,
  display = cap,
}: {
  label: string;
  options: readonly string[];
  value: string | string[];
  onChange: (next: string | string[]) => void;
  multi?: boolean;
  display?: (v: string) => string;
}) {
  const chosen = (o: string) => (Array.isArray(value) ? value.includes(o) : value === o);
  const toggle = (o: string) => {
    if (multi) {
      const cur = Array.isArray(value) ? value : [];
      onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
    } else onChange(value === o ? "" : o);
  };
  return (
    <div className="space-y-2">
      <span className="block text-[13px] font-bold text-fg-muted">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = chosen(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-bold transition-colors",
                on ? "bg-teal-tint text-teal ring-2 ring-teal" : "bg-surface-2 text-fg",
              )}
            >
              {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
              {display(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A labelled on/off switch row (role=switch), at least 52px tall. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  tone = "default",
  icon,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: "default" | "must";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-13 w-full items-center justify-between gap-3 rounded-2xl px-3.5 text-left",
        tone === "must" ? "bg-[var(--accent-tint)] text-[var(--accent-text)]" : "bg-surface-2 text-fg",
      )}
    >
      <span className="flex items-center gap-2 font-bold">
        {icon}
        <span>
          {label}
          {hint && <span className="block text-[13px] font-medium opacity-80">{hint}</span>}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors",
          checked ? (tone === "must" ? "bg-accent" : "bg-teal") : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-6 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-[left]",
            checked ? "left-[25px]" : "left-[3px]",
          )}
        />
      </span>
    </button>
  );
}

/** A small uppercase label that starts a group of fields. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-t border-border pt-4 font-mono text-[11px] font-bold tracking-[0.1em] text-fg-muted uppercase">
      {children}
    </h3>
  );
}
