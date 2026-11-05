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

// Deeper shades of the brand colours so white initials meet WCAG AA (>= 4.5:1).
const AVATAR_COLORS = ["bg-[#1F7A70]", "bg-[#B9472B]", "bg-[#3D6A88]", "bg-gold text-ink", "bg-[#6D597A]", "bg-navy"];

/**
 * Avatar colour. Pass the traveler's position so everyone on a trip gets a different colour;
 * without it, falls back to a hash of the name.
 */
export function avatarColor(name: string, index?: number): string {
  if (index !== undefined && index >= 0) return AVATAR_COLORS[index % AVATAR_COLORS.length];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** "1h 30m", "45m", "2h". */
export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

/** "23:30:00" → "23:30". */
export const formatTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Local wall-clock timestamp "2026-06-16T22:20:00" → "Tue 16 Jun, 22:20". */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return `${formatDay(ts.slice(0, 10))}, ${ts.slice(11, 16)}`;
}
