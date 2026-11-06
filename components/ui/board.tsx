import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-9 w-[26px] rounded-md text-xl",
  md: "h-[46px] w-[34px] rounded-[7px] text-[26px]",
  lg: "h-[74px] w-[52px] rounded-[10px] text-5xl",
} as const;

/**
 * Departure-board "flap" digits: dark tile, amber monospace digit, hairline across the middle.
 * The one signature element. Decorative: pair it with real text for screen readers.
 */
export function Board({
  value,
  size = "md",
  className,
}: {
  value: string | number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex gap-[5px]", className)} aria-hidden>
      {[...String(value)].map((d, i) => (
        <span
          key={i}
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center bg-board font-mono font-bold text-board-digit tabular-nums after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-[var(--board-seam)]",
            SIZES[size],
          )}
        >
          {d}
        </span>
      ))}
    </span>
  );
}
