"use client";

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

/** Pill toggle (e.g. PHP / VND, Light / System / Dark). Always has exactly one value. */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as V)}
      aria-label={label}
      className={cn("inline-flex rounded-2xl bg-surface-2 p-1 ring-1 ring-border", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="min-h-10 flex-1 rounded-xl px-4 text-sm font-semibold text-fg-muted transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-fg data-[state=on]:shadow-card"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
