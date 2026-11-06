import { MapPinned } from "lucide-react";
import type { ReactNode } from "react";

/** Drawn stand-in for the map behind access pages (real tiles arrive with the wizard). */
function MapBackdrop() {
  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox="560 90 440 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect x="-100" y="-100" width="1300" height="800" fill="var(--sea)" />
      <g stroke="var(--coast)" strokeWidth="0.8" opacity="0.55" fill="none" vectorEffect="non-scaling-stroke">
        <path d="M0 125H1000M0 250H1000M0 375H1000M600 0V500M800 0V500" />
      </g>
      <g fill="var(--land)" stroke="var(--coast)" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
        <path d="M560 70L700 50L850 70L910 120L890 180L830 200L790 260L740 240L700 200L650 190L600 170L570 130Z" />
        <path d="M762 218L800 212L812 258L790 304L772 262Z" />
        <ellipse cx="820" cy="318" rx="34" ry="9" />
        <ellipse cx="872" cy="300" rx="20" ry="8" />
        <ellipse cx="760" cy="316" rx="22" ry="8" />
      </g>
    </svg>
  );
}

/** Full-screen access page: a quiet map, one white panel, no app chrome. */
export function GateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[var(--sea)] lg:items-center">
      <MapBackdrop />
      <section className="relative flex w-full flex-col gap-3.5 rounded-t-[28px] bg-surface px-6 pt-7 pb-9 shadow-[var(--shadow-sheet)] lg:w-[460px] lg:rounded-[28px] lg:p-9 lg:shadow-[0_24px_60px_rgb(0_0_0/0.2)] dark:lg:shadow-[0_0_0_1px_var(--line),0_24px_60px_rgb(0_0_0/0.5)]">
        <div className="flex items-center gap-2.5 font-display text-lg font-extrabold">
          <span className="grid size-9 place-items-center rounded-[11px] bg-ink text-ground" aria-hidden>
            <MapPinned className="size-5" />
          </span>
          Trip Planner
        </div>
        {children}
      </section>
    </div>
  );
}

export const gateTitle = "font-display text-[32px] leading-tight font-extrabold tracking-tight lg:text-4xl";
