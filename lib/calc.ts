/**
 * Pure trip maths. No React, no Supabase: everything here is unit-tested in calc.test.ts.
 * Dates are ISO date-only strings ("2026-06-16") and are compared as calendar days,
 * never as instants, so time zones and DST can't shift a day.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type RateInfo = { foreign_currency: string; rate: number | string };
export type MoneyLike = { currency: string; amount: number | string };

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Rounds to cents, avoiding binary drift (1.005 → 1.01). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Amount in the trip's home currency. Anything not in the foreign currency is treated as home currency. */
export function homeAmount(expense: MoneyLike, trip: RateInfo): number {
  const amount = num(expense.amount);
  return expense.currency === trip.foreign_currency ? amount * num(trip.rate) : amount;
}

export function menuHomePrice(priceForeign: number | string | null | undefined, rate: number | string): number | null {
  if (priceForeign === null || priceForeign === undefined || priceForeign === "") return null;
  return num(priceForeign) * num(rate);
}

export type CategorizedExpense = MoneyLike & { category_id: string | null };

/** Home-currency spend per category id. Uncategorised spend is keyed by "none". */
export function spentByCategory(expenses: CategorizedExpense[], trip: RateInfo): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category_id ?? "none";
    out.set(key, (out.get(key) ?? 0) + homeAmount(e, trip));
  }
  return out;
}

export function totalSpent(expenses: MoneyLike[], trip: RateInfo): number {
  return expenses.reduce((sum, e) => sum + homeAmount(e, trip), 0);
}

export function remaining(budget: number | string, spent: number): number {
  return num(budget) - spent;
}

/** Share of the budget used, in percent. 0 when there is no budget (avoids divide-by-zero). */
export function percentUsed(budget: number | string, spent: number): number {
  const b = num(budget);
  return b > 0 ? (spent / b) * 100 : 0;
}

// ---------------------------------------------------------------------------
// Settle up
// ---------------------------------------------------------------------------

export type Traveler = { id: string; name: string };
export type PaidExpense = MoneyLike & { paid_by: string | null };

export type SettleRow = { traveler: Traveler; paid: number; share: number; balance: number };
export type Transfer = { from: Traveler; to: Traveler; amount: number };
export type Settlement = {
  total: number;
  share: number;
  rows: SettleRow[];
  transfers: Transfer[];
  /** Spend with no payer: counts toward the total but not toward anyone's "paid". */
  unassigned: number;
};

const SETTLE_EPSILON = 0.5;

/**
 * Equal split of total spend. Balance = paid − fair share (positive = is owed money).
 * Transfers greedily match the largest debtor with the largest creditor, which gives
 * at most n−1 payments; balances under 0.5 are ignored as rounding noise.
 */
export function settleUp(expenses: PaidExpense[], travelers: Traveler[], trip: RateInfo): Settlement {
  const total = totalSpent(expenses, trip);
  const n = travelers.length;
  const share = n > 0 ? total / n : 0;
  const ids = new Set(travelers.map((t) => t.id));

  const paid = new Map<string, number>();
  let unassigned = 0;
  for (const e of expenses) {
    const amt = homeAmount(e, trip);
    if (e.paid_by && ids.has(e.paid_by)) paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + amt);
    else unassigned += amt;
  }

  const rows = travelers.map((traveler) => {
    const p = paid.get(traveler.id) ?? 0;
    return { traveler, paid: round2(p), share: round2(share), balance: round2(p - share) };
  });

  const debtors = rows
    .filter((r) => r.balance <= -SETTLE_EPSILON)
    .map((r) => ({ t: r.traveler, amt: -r.balance }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = rows
    .filter((r) => r.balance >= SETTLE_EPSILON)
    .map((r) => ({ t: r.traveler, amt: r.balance }))
    .sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay >= SETTLE_EPSILON) transfers.push({ from: debtors[i].t, to: creditors[j].t, amount: round2(pay) });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < SETTLE_EPSILON) i++;
    if (creditors[j].amt < SETTLE_EPSILON) j++;
  }

  return { total: round2(total), share: round2(share), rows, transfers, unassigned: round2(unassigned) };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar-day number for an ISO date (days since 1970-01-01), independent of time zone. */
export function dayIndex(iso: string): number {
  const m = ISO_DATE.exec(iso.slice(0, 10));
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Whole days from a to b (b − a). */
export const daysBetween = (a: string, b: string): number => dayIndex(b) - dayIndex(a);

/** Today's date on the user's device as YYYY-MM-DD (local calendar, not UTC). */
export function localISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date((dayIndex(iso) + days) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Inclusive trip length in days (16th → 26th = 11). null when a date is missing or the range is reversed. */
export function tripLength(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const len = daysBetween(start, end) + 1;
  return len > 0 ? len : null;
}

export function tripNights(start: string | null, end: string | null): number | null {
  const len = tripLength(start, end);
  return len === null ? null : len - 1;
}

export type Countdown =
  | { kind: "before"; n: number } // n = days to go
  | { kind: "during"; n: number; of: number } // Day n of `of`
  | { kind: "after"; n: number } // n = days since the trip ended
  | { kind: "unset" };

export function daysToGo(today: string, start: string | null, end: string | null): Countdown {
  if (!start) return { kind: "unset" };
  const finish = end && daysBetween(start, end) >= 0 ? end : start;
  const toStart = daysBetween(today, start);
  if (toStart > 0) return { kind: "before", n: toStart };
  const sinceEnd = daysBetween(finish, today);
  if (sinceEnd > 0) return { kind: "after", n: sinceEnd };
  return { kind: "during", n: -toStart + 1, of: daysBetween(start, finish) + 1 };
}

/** Trip day number for a date (start date = Day 1). */
export function dayNumberFor(date: string, start: string): number {
  return daysBetween(start, date) + 1;
}

export function stayNights(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const n = daysBetween(checkIn, checkOut);
  return n >= 0 ? n : null;
}

export function pricePerNight(total: number | string | null, nights: number | null): number | null {
  if (total === null || total === "" || !nights || nights <= 0) return null;
  return num(total) / nights;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Percent of items matching `done`, 0 for an empty list. */
export function progress<T>(items: T[], done: (item: T) => boolean): { done: number; total: number; percent: number } {
  const total = items.length;
  const d = items.filter(done).length;
  return { done: d, total, percent: total ? (d / total) * 100 : 0 };
}

export const packedProgress = (items: { packed: boolean }[]) => progress(items, (i) => i.packed);
export const itineraryProgress = (items: { done: boolean }[]) => progress(items, (i) => i.done);
export const bookedProgress = (items: { status: string }[]) =>
  progress(
    items.filter((i) => i.status !== "Cancelled"),
    (i) => i.status === "Booked" || i.status === "Done",
  );
export const giftsProgress = (items: { bought: boolean }[]) => progress(items, (i) => i.bought);
