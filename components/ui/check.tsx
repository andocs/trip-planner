"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Round checkbox with a 44px tap area, for done / packed / bought toggles. */
export function CheckButton({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn("-m-2 grid size-11 shrink-0 place-items-center rounded-full", className)}
    >
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full border-2 transition-colors",
          checked ? "border-teal bg-teal text-white" : "border-muted bg-surface",
        )}
      >
        {checked && <Check className="size-4" strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}
