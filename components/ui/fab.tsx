"use client";

import { Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { useCanEdit } from "@/components/trip-gate";
import { cn } from "@/lib/utils";

/** Floating action button, sitting above the bottom tab bar on phones. Viewers never see it. */
export function Fab({ label, className, ...props }: ComponentProps<"button"> & { label: string }) {
  const canEdit = useCanEdit();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "fixed right-4 bottom-[calc(var(--tabbar-h)+1rem)] z-30 inline-flex size-14 items-center justify-center gap-2 rounded-full bg-accent font-bold text-accent-ink shadow-float transition-transform active:scale-95 lg:right-8 lg:bottom-8 lg:h-14 lg:w-auto lg:px-6",
        className,
      )}
      {...props}
    >
      <Plus className="size-7" strokeWidth={2.6} aria-hidden />
      <span className="hidden lg:inline">Add</span>
    </button>
  );
}
