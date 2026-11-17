/**
 * How one expense is split between travelers. Stored in `expenses.split` (null means "equally between everyone").
 *
 *  - members: who shares the bill (equal split) -- for percent and amount splits the members are the keys of `shares`.
 *  - mode "equal": the same part each. "percent": each person's percent of the items (must total 100).
 *    "amount": each person's flat amount of the items, in the expense's own currency (must total the items).
 *  - servicePct: a service charge that is already INCLUDED in the amount paid (the bill says 10%, the total on the receipt
 *    has it). The items are then amount / (1 + pct / 100) and the rest is the service charge.
 *  - serviceSplit: the service charge is shared "proportional" to what each person's items cost (the default), or "equal"
 *    between everyone who shares the bill.
 *
 * Pure: no React, no network. All results are in the same currency as the amount they are given.
 */

export type SplitMode = "equal" | "percent" | "amount";
export type SplitSpec = {
  mode: SplitMode;
  members: string[];
  shares?: Record<string, number>;
  servicePct?: number;
  serviceSplit?: "proportional" | "equal";
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Read a stored split. Anything that doesn't fit reads as "no split" (equal between everyone), never an error. */
export function parseSplit(raw: unknown): SplitSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const mode = r.mode === "percent" || r.mode === "amount" || r.mode === "equal" ? r.mode : null;
  if (!mode) return null;
  const members = Array.isArray(r.members) ? r.members.filter((m): m is string => typeof m === "string") : [];
  const shares: Record<string, number> = {};
  if (r.shares && typeof r.shares === "object" && !Array.isArray(r.shares))
    for (const [k, v] of Object.entries(r.shares as Record<string, unknown>)) if (isNum(v)) shares[k] = v;
  const servicePct = isNum(r.servicePct) && r.servicePct > 0 && r.servicePct <= 100 ? r.servicePct : undefined;
  const spec: SplitSpec = {
    mode,
    members: mode === "equal" ? members : Object.keys(shares),
    ...(mode === "equal" ? {} : { shares }),
    ...(servicePct ? { servicePct, serviceSplit: r.serviceSplit === "equal" ? ("equal" as const) : ("proportional" as const) } : {}),
  };
  return spec.members.length > 0 ? spec : null;
}

/** Why a split can't be saved, or null. `amount` is the whole amount paid. */
export function splitProblem(spec: SplitSpec, amount: number): string | null {
  if (spec.members.length === 0) return "Pick at least one person to split with.";
  if (spec.servicePct !== undefined && (spec.servicePct <= 0 || spec.servicePct > 100)) return "A service charge is between 0 and 100 percent.";
  if (spec.mode === "percent") {
    const sum = spec.members.reduce((s, m) => s + (spec.shares?.[m] ?? 0), 0);
    if (Math.abs(sum - 100) > 0.01) return `The percentages add up to ${round2(sum)}, not 100.`;
  }
  if (spec.mode === "amount") {
    const base = itemsOf(amount, spec.servicePct);
    const sum = spec.members.reduce((s, m) => s + (spec.shares?.[m] ?? 0), 0);
    if (Math.abs(sum - base) > 0.01) return `The amounts add up to ${round2(sum)}, but the items come to ${round2(base)}.`;
  }
  return null;
}

/** The part of the amount that is the items, without the service charge that is included in it. */
export function itemsOf(amount: number, servicePct: number | undefined): number {
  return servicePct ? amount / (1 + servicePct / 100) : amount;
}

/**
 * What each person owes for this expense, summing to `amount` (the last cent goes to the largest share). With no spec
 * the bill is split equally between `everyone`. Ids not in `everyone` are ignored.
 */
export function expenseShares(amount: number, spec: SplitSpec | null, everyone: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (everyone.length === 0 || !(amount > 0 || amount < 0)) return out;
  const known = new Set(everyone);
  const members = (spec ? spec.members : everyone).filter((m) => known.has(m));
  if (members.length === 0) return out;

  const base = itemsOf(amount, spec?.servicePct);
  const service = amount - base;

  // each person's weight of the items
  let weights: number[];
  if (!spec || spec.mode === "equal") weights = members.map(() => 1);
  else if (spec.mode === "percent") weights = members.map((m) => spec.shares?.[m] ?? 0);
  else weights = members.map((m) => spec.shares?.[m] ?? 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) weights = members.map(() => 1);
  const wsum = weights.reduce((a, b) => a + b, 0);

  const raw = members.map((m, i) => {
    const items = base * (weights[i] / wsum);
    const svc = spec?.serviceSplit === "equal" ? service / members.length : service * (weights[i] / wsum);
    return { m, v: items + svc };
  });
  const cents = raw.map((r) => ({ m: r.m, v: round2(r.v) }));
  const drift = round2(amount - cents.reduce((a, c) => a + c.v, 0));
  if (drift !== 0) {
    const biggest = cents.reduce((a, c) => (Math.abs(c.v) > Math.abs(a.v) ? c : a), cents[0]);
    biggest.v = round2(biggest.v + drift);
  }
  for (const c of cents) out.set(c.m, round2((out.get(c.m) ?? 0) + c.v));
  return out;
}

/** The spec to store: null when it is just "equally between everyone" with no service charge. */
export function specToStore(spec: SplitSpec, everyone: string[]): SplitSpec | null {
  const all = everyone.length > 0 && spec.members.length === everyone.length && everyone.every((e) => spec.members.includes(e));
  if (spec.mode === "equal" && all && !spec.servicePct) return null;
  return spec;
}
