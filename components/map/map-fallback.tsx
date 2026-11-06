import { cn } from "@/lib/utils";

/** Drawn stand-in shown when the map can't start (no WebGL, offline). Search and lists still work. */
export function MapFallback({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-[var(--sea)]", className)}>
      <svg className="size-full" viewBox="560 90 440 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g stroke="var(--coast)" strokeWidth="0.8" opacity="0.55" fill="none" vectorEffect="non-scaling-stroke">
          <path d="M0 125H1000M0 250H1000M0 375H1000M600 0V500M800 0V500" />
        </g>
        <g fill="var(--land)" stroke="var(--coast)" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
          <path d="M560 70L700 50L850 70L910 120L890 180L830 200L790 260L740 240L700 200L650 190L600 170L570 130Z" />
          <path d="M762 218L800 212L812 258L790 304L772 262Z" />
        </g>
      </svg>
      <p className="absolute bottom-3 left-3 w-max max-w-[80%] rounded-full bg-surface px-4 py-2 text-sm font-bold text-fg-muted shadow-float">
        Map unavailable here. Search still works.
      </p>
    </div>
  );
}
