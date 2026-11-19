"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-9 w-[26px] rounded-md text-xl",
  md: "h-[46px] w-[34px] rounded-[7px] text-[26px]",
  lg: "h-[74px] w-[52px] rounded-[10px] text-5xl",
} as const;

type Flip = { dir: "up" | "down"; /** per digit, counted from the right: did it change? */ changed: boolean[] };

/**
 * Departure-board "flap" digits: dark tile, amber monospace digit, hairline across the middle.
 * The one signature element. Decorative: pair it with real text for screen readers.
 *
 * When the value changes, the digits that changed flip like a board: up when the number went up, down when it went
 * down (a short 0.3 s turn about the seam). Nothing animates on first render, and with reduced motion the digit just
 * changes.
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
  const text = String(value);
  // "Previous value" is kept in state and compared during render (the supported way to react to a changed prop).
  const [prev, setPrev] = useState(text);
  const [flip, setFlip] = useState<Flip | null>(null);
  if (text !== prev) {
    const a = Number(prev);
    const b = Number(text);
    const a2 = [...prev].reverse();
    const b2 = [...text].reverse();
    setPrev(text);
    setFlip({
      dir: Number.isFinite(a) && Number.isFinite(b) && b < a ? "down" : "up",
      changed: b2.map((ch, i) => ch !== a2[i]),
    });
  }
  const digits = [...text];
  return (
    <span className={cn("inline-flex gap-[5px]", className)} aria-hidden>
      {digits.map((d, i) => {
        const fromRight = digits.length - 1 - i;
        const animate = flip?.changed[fromRight] ? (flip.dir === "up" ? "board-flip-up" : "board-flip-down") : "";
        return (
          <span
            key={`${i}-${d}`}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center bg-board font-mono font-bold text-board-digit tabular-nums after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-[var(--board-seam)]",
              SIZES[size],
            )}
          >
            <span className={cn("inline-block", animate)}>{d}</span>
          </span>
        );
      })}
    </span>
  );
}
