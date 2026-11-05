import { cn } from "@/lib/utils";

/**
 * Horizontal progress bar. `tone="budget"` turns gold above 90% and coral above 100%.
 * The visible bar caps at 100% but aria-valuenow reports the real value.
 */
export function Progress({
  value,
  label,
  tone = "teal",
  className,
}: {
  value: number;
  label: string;
  tone?: "teal" | "budget" | "gold" | "coral" | "navy";
  className?: string;
}) {
  const pct = Number.isFinite(value) ? Math.max(0, value) : 0;
  const color =
    tone === "budget"
      ? pct > 100
        ? "bg-coral"
        : pct > 90
          ? "bg-gold"
          : "bg-teal"
      : { teal: "bg-teal", gold: "bg-gold", coral: "bg-coral", navy: "bg-navy dark:bg-muted" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-border/70", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", color)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}
