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
      className={cn("inline-flex rounded-full bg-surface-2 p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="min-h-11 flex-1 rounded-full px-4 text-sm font-bold text-fg-muted transition-colors data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-[0_1px_3px_rgb(0_0_0/0.16)] dark:data-[state=on]:bg-ink dark:data-[state=on]:text-ground dark:data-[state=on]:shadow-none"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
