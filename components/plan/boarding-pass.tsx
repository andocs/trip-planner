"use client";

import { Lock, Plane } from "lucide-react";
import { LogExpenseRow } from "@/components/plan/log-expense";
import { useCanEdit, useTrip } from "@/components/trip-gate";
import { Board } from "@/components/ui/board";
import { StatusBadge, StatusChip } from "@/components/ui/status-chip";
import { arrivalDayOffset, formatDuration, isIdeaStatus, MASKED_REF } from "@/lib/flights";
import { formatDay, formatMoney, formatTime } from "@/lib/format";
import type { Status } from "@/lib/constants";
import type { Row } from "@/lib/queries/table";
import { cn } from "@/lib/utils";

type Flight = Row<"flights">;

const time = (ts: string | null) => (ts && ts.length >= 16 ? formatTime(ts.slice(11, 16)) : "");

/** Decorative stripes only. It carries no data, is hidden from screen readers and is never meant to be scanned. */
function Stripes() {
  const widths = [2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 1, 2, 2, 1, 3, 1, 2, 1, 3, 2];
  let x = 0;
  const bars = widths.map((n, i) => {
    const bar = i % 2 === 0 ? <rect key={i} x={x} y={0} width={n * 1.6} height={40} /> : null;
    x += n * 1.6 + 1.2;
    return bar;
  });
  return (
    <svg
      className="h-9 w-full text-ink opacity-40"
      viewBox="0 0 120 40"
      preserveAspectRatio="none"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      {bars}
    </svg>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-surface-2 p-2 lg:px-2.5">
      <dt className="font-mono text-[11px] font-bold tracking-[0.1em] text-fg-muted uppercase">{label}</dt>
      <dd
        className={cn(
          "truncate font-mono text-base font-bold tabular-nums",
          !value && "font-sans text-sm font-medium text-fg-muted",
        )}
      >
        {value || "Not set"}
      </dd>
    </div>
  );
}

/**
 * A flight as a boarding pass: airline and number, big airport codes, the times, the date in board numerals, terminal /
 * gate / seat, and a tear-off stub with the booking reference, the fare and "Log as expense". Phone: stacked. Desktop:
 * side by side. The booking reference is for the owner only; viewers see it hidden and the database never sends it.
 */
export function BoardingPass({
  flight: f,
  bookingRef,
  onOpen,
  onStatus,
}: {
  flight: Flight;
  /** The reference from flight_refs (owner only), if any. */
  bookingRef: string | null;
  onOpen: () => void;
  onStatus: (s: Status) => void;
}) {
  const trip = useTrip();
  const canEdit = useCanEdit();
  const idea = isIdeaStatus(f.status);
  const cancelled = f.status === "Cancelled";
  const dep = time(f.departs_at);
  const arr = time(f.arrives_at);
  const plusDays = arrivalDayOffset(f.departs_at, f.arrives_at);
  const from = f.from_code?.trim() || "???";
  const to = f.to_code?.trim() || "???";
  const label = `${f.from_code ?? "?"} to ${f.to_code ?? "?"} ${f.flight_no ?? ""}`.trim();
  // Owners see the reference (from flight_refs, or an old one still in the flight row); viewers only learn one exists.
  const legacy = canEdit ? f.booking_ref : null;
  const ref = bookingRef ?? legacy;
  const hidden = !canEdit && (f.has_ref || !!f.booking_ref);

  const body = (
    <>
      <span className="flex items-center gap-2 pr-28 text-sm font-bold">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-ground" aria-hidden>
          <Plane className="size-4" strokeWidth={2.4} />
        </span>
        <span className="truncate">
          {f.airline || "Airline not set"}
          {f.flight_no && <span className="ml-1.5 font-mono tracking-wide tabular-nums">{f.flight_no}</span>}
        </span>
      </span>
      <span className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <span>
          <span
            className={cn(
              "block font-display text-[44px] leading-[0.95] font-extrabold tracking-[0.02em] lg:text-[56px]",
              cancelled && "text-fg-muted line-through decoration-2",
            )}
          >
            {from}
          </span>
          <span
            className={cn(
              "mt-1.5 block font-mono text-lg font-bold tabular-nums",
              cancelled && "text-fg-muted line-through decoration-2",
            )}
          >
            {dep || "–:–"}
          </span>
        </span>
        <span
          className="flex min-w-0 flex-col items-center gap-1 text-xs font-bold text-fg-muted"
          aria-hidden={!f.duration_min}
        >
          <span>{formatDuration(f.duration_min)}</span>
          <span className="flex w-full items-center gap-1.5 text-ink">
            <i className="h-0 flex-1 border-t-2 border-dashed border-line-strong" />
            <Plane className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <i className="h-0 flex-1 border-t-2 border-dashed border-line-strong" />
          </span>
          <span className="sr-only">{`${from} to ${to}`}</span>
        </span>
        <span className="text-right">
          <span
            className={cn(
              "block font-display text-[44px] leading-[0.95] font-extrabold tracking-[0.02em] lg:text-[56px]",
              cancelled && "text-fg-muted line-through decoration-2",
            )}
          >
            {to}
          </span>
          <span
            className={cn(
              "mt-1.5 block font-mono text-lg font-bold tabular-nums",
              cancelled && "text-fg-muted line-through decoration-2",
            )}
          >
            {arr || "–:–"}
            {plusDays > 0 && <sup className="ml-0.5 text-[11px] font-bold text-fg-muted">+{plusDays}</sup>}
          </span>
        </span>
      </span>
      {f.departs_at && (
        <span className="flex items-center gap-2 text-sm font-bold">
          <Board value={formatDay(f.departs_at, "d")} size="sm" />
          <span className="uppercase">{formatDay(f.departs_at, "MMM · EEE")}</span>
          {f.arrives_at && f.arrives_at.length >= 16 && (
            <span className="sr-only">{` ${dep} to ${arr}${plusDays ? ` plus ${plusDays} day` : ""}`}</span>
          )}
        </span>
      )}
    </>
  );

  return (
    <article
      aria-label={`${from} to ${to}, ${f.airline ?? "airline not set"} ${f.flight_no ?? ""}, ${f.status}`}
      className={cn(
        "relative flex flex-col rounded-[22px] text-fg lg:flex-row",
        idea ? "bg-transparent ring-2 ring-line-strong ring-inset" : "bg-surface shadow-card",
        f.status === "Done" && "opacity-80",
      )}
    >
      <div className="relative min-w-0 flex-1">
        {canEdit ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${label}. Edit`}
            className="flex w-full flex-col gap-3.5 p-[18px] pb-4 text-left lg:px-6 lg:py-5"
          >
            {body}
          </button>
        ) : (
          <div className="flex flex-col gap-3.5 p-[18px] pb-4 lg:px-6 lg:py-5">{body}</div>
        )}
        <div className="absolute top-3.5 right-3.5 lg:top-4 lg:right-5">
          {canEdit ? (
            <StatusChip status={f.status} label={`${f.from_code ?? "?"} to ${f.to_code ?? "?"}`} onChange={onStatus} />
          ) : (
            <StatusBadge status={f.status} />
          )}
        </div>
        <dl className="grid grid-cols-3 gap-1.5 px-[18px] pb-4 lg:gap-2 lg:px-6 lg:pb-5">
          <Fact label="Terminal" value={f.terminal} />
          <Fact label="Gate" value={f.gate} />
          <Fact label="Seat" value={f.seat} />
        </dl>
      </div>

      {/* perforation, with a notch cut out at each end */}
      <div
        aria-hidden
        className="relative mx-[18px] shrink-0 border-t-2 border-dashed border-line-strong before:absolute before:-top-3 before:-left-[29px] before:size-[22px] before:rounded-full before:bg-ground before:content-[''] after:absolute after:-top-3 after:-right-[29px] after:size-[22px] after:rounded-full after:bg-ground after:content-[''] lg:mx-0 lg:my-[18px] lg:border-t-0 lg:border-l-2 lg:before:-top-[30px] lg:before:-left-3 lg:after:top-auto lg:after:right-auto lg:after:-bottom-[30px] lg:after:-left-3"
      />

      <div className="flex shrink-0 flex-col gap-3 p-[18px] pt-4 lg:w-[264px] lg:p-[22px]">
        {(ref || hidden || canEdit) && (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-fg-muted uppercase">
              Booking ref
            </span>
            {hidden ? (
              <>
                <span
                  className="inline-flex items-center gap-2 font-mono text-[22px] font-bold tracking-[0.14em] text-fg-muted"
                  aria-label="Hidden for viewers"
                >
                  <Lock className="size-[18px]" strokeWidth={2.4} aria-hidden />
                  {MASKED_REF}
                </span>
                <span className="text-xs text-fg-muted">Only the owner can see this.</span>
              </>
            ) : ref ? (
              <span className="font-mono text-[22px] font-bold tracking-[0.14em]">{ref}</span>
            ) : (
              <span className="text-[15px] text-fg-muted">Not added yet</span>
            )}
          </div>
        )}
        <Stripes />
        {f.fare !== null && (
          <p className="flex flex-col">
            <span className="text-xs text-fg-muted">Fare</span>
            <span className="font-mono text-[17px] font-bold tabular-nums">
              {formatMoney(f.fare, trip.home_currency)}
            </span>
          </p>
        )}
        <LogExpenseRow kind="flights" item={f} className="pb-0" />
      </div>
    </article>
  );
}

/** "Layover 2h 40m · SIN", drawn between two passes that connect. */
export function LayoverPill({ minutes, airport }: { minutes: number; airport: string }) {
  return (
    <li className="flex flex-col items-center" aria-label={`Layover ${formatDuration(minutes)} in ${airport}`}>
      <span aria-hidden className="h-3.5 border-l-2 border-dashed border-line-strong" />
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-[13px] font-bold ring-[1.5px] ring-line-strong ring-inset">
        Layover {formatDuration(minutes)} · {airport}
      </span>
      <span aria-hidden className="h-3.5 border-l-2 border-dashed border-line-strong" />
    </li>
  );
}
