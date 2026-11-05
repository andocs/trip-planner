import { format, parseISO } from "date-fns";

const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "PHP 1,234.00" — ISO code, never a symbol. */
export function formatMoney(amount: number | string | null | undefined, currency: string): string {
  const n = Number(amount ?? 0);
  const sign = n < 0 ? "−" : "";
  return `${sign}${currency} ${moneyFmt.format(Math.abs(Number.isFinite(n) ? n : 0))}`;
}

export function formatCompact(amount: number, currency: string): string {
  return `${currency} ${compactFmt.format(amount)}`;
}

export function formatPercent(p: number): string {
  return `${Math.round(p)}%`;
}

/** "Tue 16 Jun" from an ISO date. */
export function formatDay(iso: string | null | undefined, pattern = "EEE d MMM"): string {
  if (!iso) return "";
  return format(parseISO(iso.slice(0, 10)), pattern);
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Dates not set";
  if (!end || end === start) return formatDay(start, "d MMM yyyy");
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDay(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${formatDay(end, "d MMM yyyy")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Picks a stable brand colour for an avatar from a name. */
export function avatarColor(name: string): string {
  const colors = ["bg-teal", "bg-coral", "bg-gold text-ink", "bg-navy", "bg-[#6D597A]", "bg-[#457B9D]"];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}
