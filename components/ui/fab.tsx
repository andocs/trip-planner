import { Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Floating action button, sitting above the bottom tab bar on phones. */
export function Fab({ label, className, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "fixed right-4 bottom-[calc(var(--tabbar-h)+1rem)] z-30 grid size-14 place-items-center rounded-2xl bg-coral text-white shadow-lg shadow-coral/30 transition-transform active:scale-95 lg:right-8 lg:bottom-8",
        className,
      )}
      {...props}
    >
      <Plus className="size-7" aria-hidden />
    </button>
  );
}
