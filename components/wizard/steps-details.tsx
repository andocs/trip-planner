"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Share2,
  UserPlus,
  ArrowRightLeft,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { inviteLink } from "@/components/settings/invite-section";
import { Board } from "@/components/ui/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StepHeading } from "@/components/wizard/steps-map";
import type { StepProps } from "@/components/wizard/wizard";
import { daysBetween, localISODate, tripLength } from "@/lib/calc";
import { formatDateRange } from "@/lib/format";
import type { Trip } from "@/lib/queries/trip";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";
import {
  currencyOptions,
  defaultTripName,
  isCurrencyCode,
  monthWeeks,
  moveDay,
  nightsHint,
  pickRange,
  ratePreview,
} from "@/lib/wizard";

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex flex-col gap-2.5 pt-5">{children}</div>;
}

const monthName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
const dayNum = (iso: string) => String(Number(iso.slice(8)));

/* ------------------------------------------------------------------ 3 When */

function RangeCalendar({
  start,
  end,
  onPick,
}: {
  start: string | null;
  end: string | null;
  onPick: (iso: string) => void;
}) {
  const today = useClientValue(localISODate, "2026-01-01");
  const [month, setMonth] = useState(() => (start ?? today).slice(0, 7));
  const [focus, setFocus] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [y, m] = month.split("-").map(Number);
  const weeks = useMemo(() => monthWeeks(y, m - 1), [y, m]);

  useEffect(() => {
    if (!focus) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, month]);

  const shift = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  function onKey(e: React.KeyboardEvent, iso: string) {
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!by) return;
    e.preventDefault();
    const next = moveDay(iso, by);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
    setFocus(next);
  }

  const tabbable = focus ?? start ?? (month === today.slice(0, 7) ? today : `${month}-01`);
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="grid size-11 place-items-center rounded-full"
        >
          <ChevronLeft className="size-[22px]" aria-hidden />
        </button>
        <b aria-live="polite">{monthName(`${month}-01`)}</b>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="grid size-11 place-items-center rounded-full"
        >
          <ChevronRight className="size-[22px]" aria-hidden />
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={monthName(`${month}-01`)} className="grid grid-cols-7 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} role="columnheader" className="py-1.5 font-mono text-[11px] font-bold text-fg-muted">
            {d}
          </span>
        ))}
        {weeks.flat().map((iso, i) => {
          if (!iso) return <span key={i} role="gridcell" className="h-11" />;
          const isStart = iso === start;
          const isEnd = iso === end;
          const inside = !!start && !!end && iso > start && iso < end;
          const col = i % 7;
          return (
            <span
              key={iso}
              role="gridcell"
              className={cn(
                "relative h-11",
                inside && "bg-teal-tint",
                inside && col === 0 && "rounded-l-full",
                inside && col === 6 && "rounded-r-full",
                isStart && end && "bg-gradient-to-r from-transparent from-50% to-teal-tint to-50%",
                isEnd && "bg-gradient-to-r from-teal-tint from-50% to-transparent to-50%",
              )}
            >
              <button
                type="button"
                data-day={iso}
                tabIndex={iso === tabbable ? 0 : -1}
                aria-label={new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
                  dateStyle: "long",
                  timeZone: "UTC",
                })}
                aria-pressed={isStart || isEnd}
                onClick={() => {
                  setFocus(iso);
                  onPick(iso);
                }}
                onKeyDown={(e) => onKey(e, iso)}
                className={cn(
                  "mx-auto block h-11 w-full text-[15px] font-bold tabular-nums",
                  inside && "text-teal",
                  (isStart || isEnd) && "w-11 rounded-full bg-ink text-ground",
                  !inside && !isStart && !isEnd && iso === today && "w-11 rounded-full ring-2 ring-line-strong",
                )}
              >
                {dayNum(iso)}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function StepWhen({ d, set, go, saving }: StepProps) {
  const len = tripLength(d.start, d.end);
  const hint = nightsHint(d.stops, d.start, d.end);
  const tile = (label: string, iso: string | null) => (
    <div className="flex flex-1 flex-col items-start gap-1.5 rounded-2xl bg-surface-2 px-3.5 py-2.5">
      <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-fg-muted uppercase">{label}</span>
      {iso ? (
        <span className="inline-flex items-center gap-2 text-[15px]">
          <b className="font-mono">{shortMonth(iso)}</b>
          <Board value={dayNum(iso)} size="sm" />
        </span>
      ) : (
        <span className="text-sm text-fg-muted">Pick a day</span>
      )}
    </div>
  );
  return (
    <>
      <StepHeading title="When are you going?" />
      <div className="mt-3 flex gap-2">
        {tile("Depart", d.start)}
        {tile("Return", d.end)}
      </div>
      {len !== null && (
        <p className="mt-2 inline-flex self-start rounded-full bg-teal-tint px-3 py-1 text-[13px] font-bold text-teal">
          {len} {len === 1 ? "day" : "days"} · {len - 1} {len - 1 === 1 ? "night" : "nights"}
        </p>
      )}
      <RangeCalendar start={d.start} end={d.end} onPick={(iso) => set(pickRange(d.start, d.end, iso))} />
      {hint && (
        <p role="note" className="mt-2 flex gap-2.5 rounded-[14px] bg-surface-2 p-3 text-sm text-fg-muted">
          <Info className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <span>{hint}</span>
        </p>
      )}
      <Footer>
        <Button
          size="lg"
          className="w-full"
          disabled={!d.start || !d.end || saving}
          onClick={() => go(4, { start_date: d.start, end_date: d.end })}
        >
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Continue to travelers
        </Button>
      </Footer>
    </>
  );
}

/* ------------------------------------------------------------------ 4 Who */

export function StepWho({ d, set, go, saving, trip }: StepProps & { trip: Trip }) {
  const [name, setName] = useState("");
  const link = inviteLink(
    useClientValue(() => window.location.origin, ""),
    trip.join_token,
  );
  const canShare = useClientValue(() => "share" in navigator, false);

  function add() {
    const n = name.trim();
    if (!n) return;
    if (d.travelers.some((t) => t.toLowerCase() === n.toLowerCase()))
      return toast.error(`${n} is already on the list.`);
    set({ travelers: [...d.travelers, n] });
    setName("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn’t copy. Select the link and copy it by hand.");
    }
  }
  const proceed = () => go(5, { travelers: d.travelers });

  return (
    <>
      <StepHeading title="Who is coming?" lede="Expenses are split equally between travelers." />
      <ul className="mt-4 flex flex-col gap-2" aria-label="Travelers">
        {d.travelers.map((t, i) => (
          <li key={t} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface-2 px-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-teal text-sm font-extrabold text-teal-ink"
              aria-hidden
            >
              {t[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">
              {t}
              {i === 0 && (
                <span className="ml-2 rounded-full bg-teal-tint px-2.5 py-0.5 text-[13px] text-teal">You</span>
              )}
            </span>
            {i > 0 && (
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => set({ travelers: d.travelers.filter((x) => x !== t) })}
                className="grid size-11 place-items-center rounded-full text-fg-muted"
              >
                <X className="size-5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="relative mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <UserPlus className="pointer-events-none absolute top-4 left-3.5 size-5 text-fg-muted" aria-hidden />
        <Input
          aria-label="Add a traveler"
          placeholder="Add a traveler"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="pl-11"
          maxLength={40}
        />
      </form>

      <div className="mt-4 rounded-2xl bg-surface-2 p-3.5">
        <div className="font-mono text-[11px] font-bold tracking-[0.12em] text-fg-muted uppercase">
          Invite link · view only
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-[14px] p-1.5 pl-3.5 ring-2 ring-line-strong">
          <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{link || "…"}</code>
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy className="size-[18px]" aria-hidden />
            Copy
          </Button>
          {canShare && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.share({ title: trip.name, url: link }).catch(() => {})}
              aria-label="Share link"
            >
              <Share2 className="size-[18px]" aria-hidden />
            </Button>
          )}
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          Anyone with this link can <b className="text-fg">view</b> the trip. They can’t edit. You can replace the link
          or remove viewers any time in Settings.
        </p>
      </div>

      <Footer>
        <Button size="lg" className="w-full" disabled={saving || d.travelers.length === 0} onClick={proceed}>
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Continue to money
        </Button>
        <Button variant="ghost" className="w-full" disabled={saving} onClick={() => go(5, { travelers: d.travelers })}>
          Skip for now
        </Button>
      </Footer>
    </>
  );
}

/* ------------------------------------------------------------------ 5 Money */

function CurrencyField({
  label,
  value,
  onChange,
  listId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  listId: string;
}) {
  const options = useMemo(() => currencyOptions(), []);
  const name = options.find((o) => o.code === value)?.name;
  return (
    <label className="block min-w-0">
      <span className="block text-[13px] font-bold text-fg-muted">{label}</span>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 3))}
        className="mt-1.5 font-bold"
        aria-describedby={`${listId}-name`}
        autoComplete="off"
      />
      <span id={`${listId}-name`} className="mt-1 block truncate text-[13px] text-fg-muted">
        {name ?? "Pick a 3-letter code"}
      </span>
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.code} value={o.code} label={o.name} />
        ))}
      </datalist>
    </label>
  );
}

export function StepMoney({ d, set, go, saving }: StepProps) {
  const [fetching, setFetching] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const rate = Number(d.rate);
  const same = d.homeCur === d.tripCur;
  const valid = isCurrencyCode(d.homeCur) && isCurrencyCode(d.tripCur) && (same || rate > 0);
  const preview = same ? null : ratePreview(rate, d.tripCur, d.homeCur);

  async function live() {
    setRateError(null);
    setFetching(true);
    try {
      const res = await fetch(`/api/rate?from=${d.tripCur}&to=${d.homeCur}`);
      const body = (await res.json()) as { rate?: number; date?: string; error?: string };
      if (!res.ok || !body.rate) throw new Error(body.error ?? "No rate available");
      set({ rate: String(Number(body.rate.toPrecision(6))), rateDate: body.date ?? null });
    } catch (e) {
      setRateError(
        `${e instanceof Error ? e.message : "No rate"}. Type one in, or try again. Your answers so far are saved.`,
      );
    } finally {
      setFetching(false);
    }
  }

  const proceed = (withBudget: boolean) =>
    go(6, {
      home_currency: d.homeCur,
      foreign_currency: d.tripCur,
      rate: same ? 1 : rate,
      rate_date: same ? null : d.rateDate,
      budget: withBudget && Number(d.budget) > 0 ? Number(d.budget) : 0,
    });

  return (
    <>
      <StepHeading title="Money basics" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <CurrencyField label="You pay in" value={d.homeCur} onChange={(v) => set({ homeCur: v })} listId="cur-home" />
        <CurrencyField
          label="Trip currency"
          value={d.tripCur}
          onChange={(v) => set({ tripCur: v })}
          listId="cur-trip"
        />
      </div>
      {!same && (
        <div className="mt-3">
          <label htmlFor="wizard-rate" className="block text-[13px] font-bold text-fg-muted">
            Exchange rate
          </label>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="font-bold whitespace-nowrap">1 {d.tripCur || "…"} =</span>
            <Input
              id="wizard-rate"
              inputMode="decimal"
              value={d.rate}
              onChange={(e) => set({ rate: e.target.value, rateDate: null })}
              aria-invalid={!(rate > 0)}
              className="font-mono"
            />
            <span className="font-bold">{d.homeCur}</span>
          </div>
          {!(rate > 0) && <p className="mt-1 text-sm font-bold text-danger">Enter a number above zero.</p>}
          <Button
            variant="outline"
            size="sm"
            className="mt-2.5"
            onClick={live}
            disabled={fetching || !isCurrencyCode(d.homeCur) || !isCurrencyCode(d.tripCur)}
          >
            {fetching ? (
              <Loader2 className="size-[18px] animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-[18px]" aria-hidden />
            )}
            {rateError ? "Try again" : "Use today’s live rate"}
          </Button>
          {d.rateDate && (
            <p className="mt-1.5 text-sm text-fg-muted">Live rate from {formatDateRange(d.rateDate, d.rateDate)}.</p>
          )}
          {rateError && (
            <p role="alert" className="mt-2 rounded-xl bg-danger-tint p-3 text-sm font-bold text-danger">
              {rateError}
            </p>
          )}
        </div>
      )}
      {preview && (
        <p role="status" className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-teal-tint p-3 font-bold text-teal">
          <ArrowRightLeft className="size-5 shrink-0" aria-hidden />
          {preview}
        </p>
      )}
      <div className="mt-3">
        <label htmlFor="wizard-budget" className="block text-[13px] font-bold text-fg-muted">
          Total budget ({d.homeCur || "…"})
        </label>
        <Input
          id="wizard-budget"
          inputMode="decimal"
          value={d.budget}
          onChange={(e) => set({ budget: e.target.value.replace(/[^\d.]/g, "") })}
          className="mt-1.5"
        />
        <p className="mt-1 text-sm text-fg-muted">Optional. Split it by category later.</p>
      </div>
      <Footer>
        <Button size="lg" className="w-full" disabled={!valid || saving} onClick={() => proceed(true)}>
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Review my trip
        </Button>
        <Button variant="ghost" className="w-full" disabled={!valid || saving} onClick={() => proceed(false)}>
          Skip budget
        </Button>
      </Footer>
    </>
  );
}

/* ------------------------------------------------------------------ 6 Review */

export function StepReview({ d, set, finishing, onCreate }: StepProps & { finishing: boolean; onCreate: () => void }) {
  const suggested = defaultTripName(d.stops, d.start);
  // Pre-fill the name the first time we get here; the owner can change it.
  useEffect(() => {
    if (!d.name) set({ name: suggested });
  }, [d.name, suggested, set]);

  const row = (k: string, v: string) => (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-3 text-[15px]">
      <span className="text-[13px] font-bold text-fg-muted">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  );
  const choice = (starter: boolean, title: string, body: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={d.starter === starter}
      onClick={() => set({ starter })}
      className={cn(
        "flex min-h-16 items-start gap-3 rounded-2xl p-3.5 text-left",
        d.starter === starter ? "bg-surface ring-2 ring-ink" : "bg-surface-2",
      )}
    >
      <span
        className={cn(
          "mt-px grid size-6 shrink-0 place-items-center rounded-full border-2",
          d.starter === starter ? "border-ink" : "border-line-strong",
        )}
      >
        {d.starter === starter && <Check className="size-3.5" strokeWidth={4} aria-hidden />}
      </span>
      <span>
        <b>{title}</b>
        <br />
        <span className="text-sm text-fg-muted">{body}</span>
      </span>
    </button>
  );
  return (
    <>
      <StepHeading title="Ready to go?" />
      <label className="mt-4 block">
        <span className="block text-[13px] font-bold text-fg-muted">Trip name</span>
        <Input
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          className="mt-1.5 font-bold"
          maxLength={60}
        />
      </label>
      <div className="mt-3">
        {row("Stops", d.stops.map((s) => `${s.name} ${s.nights}N`).join(" · ") || "None yet")}
        {row(
          "Dates",
          d.start && d.end ? `${formatDateRange(d.start, d.end)} · ${daysBetween(d.start, d.end) + 1} days` : "Not set",
        )}
        {row("Travelers", d.travelers.join(", "))}
        {row(
          "Money",
          `${d.homeCur} · ${d.tripCur}${Number(d.budget) > 0 ? ` · budget ${Number(d.budget).toLocaleString("en-US")}` : ""}`,
        )}
      </div>
      <div role="radiogroup" aria-label="How do you want to start?" className="mt-3 flex flex-col gap-2">
        <div className="font-mono text-[11px] font-bold tracking-[0.12em] text-fg-muted uppercase">
          How do you want to start?
        </div>
        {choice(false, "Empty plan", "Add flights, stays and activities as you go.")}
        {choice(true, "Starter checklist", "Adds a basic packing list and a pre-trip checklist.")}
      </div>
      <Footer>
        <Button size="lg" className="w-full" disabled={finishing || d.stops.length === 0} onClick={onCreate}>
          {finishing && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Create my trip
        </Button>
        <p className="text-center text-sm text-fg-muted">You can change everything later in Settings.</p>
      </Footer>
    </>
  );
}
