/**
 * How a traveler likes to be paid back, and the links settle-up builds from it. Pure: no network, nothing is sent anywhere
 * until the person taps a link. Handles are public to everyone on the trip (that is the point) so they hold no secrets:
 * never a card number, password or bank login; the "other" line is free text such as "GCash 0917 123 4567".
 */
import { z } from "zod";

export type Payment = { paypal?: string; venmo?: string; other?: string };

const clean = (s: string) => s.trim();

/** "@name", "name", "paypal.me/name" or a full paypal.me link all become "name". */
export function normalizePaypal(raw: string): string {
  return clean(raw).replace(/^https?:\/\//i, "").replace(/^(www\.)?paypal\.me\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
}
export function normalizeVenmo(raw: string): string {
  return clean(raw).replace(/^https?:\/\//i, "").replace(/^(www\.)?venmo\.com\/(u\/)?/i, "").replace(/^@/, "").replace(/[/?].*$/, "");
}

const optional = (re: RegExp, message: string, norm: (s: string) => string) =>
  z.string().transform(norm).refine((v) => v === "" || re.test(v), message).optional();

export const PaymentSchema = z.object({
  paypal: optional(/^[A-Za-z0-9._-]{1,40}$/, "PayPal.Me name: letters, numbers, dot, dash", normalizePaypal),
  venmo: optional(/^[A-Za-z0-9_-]{1,30}$/, "Venmo name: letters, numbers, dash, underscore", normalizeVenmo),
  other: z
    .string()
    .transform(clean)
    .refine((v) => v.length <= 120, "Keep it under 120 characters")
    .refine((v) => !/[\u0000-\u001f]/.test(v), "No line breaks")
    .optional(),
});

/** The stored value for a form's fields: empty ones dropped, null when nothing is left. */
export function toPayment(input: Payment): Payment | null {
  const out: Payment = {};
  for (const k of ["paypal", "venmo", "other"] as const) {
    const v = input[k]?.trim();
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Reads the jsonb column defensively: anything unexpected is ignored, and a handle that fails the rules is dropped. */
export function parsePayment(raw: unknown): Payment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const res = PaymentSchema.safeParse({
    paypal: typeof r.paypal === "string" ? r.paypal : undefined,
    venmo: typeof r.venmo === "string" ? r.venmo : undefined,
    other: typeof r.other === "string" ? r.other : undefined,
  });
  return res.success ? toPayment(res.data) : null;
}

export type PayLink = { label: string; href: string };

/** Links that open the payment app with the person and amount filled in. Venmo is dollars only. */
export function payLinks(p: Payment | null, amount: number, currency: string, note: string): PayLink[] {
  if (!p || !(amount > 0)) return [];
  const amt = (Math.round(amount * 100) / 100).toFixed(2);
  const links: PayLink[] = [];
  if (p.paypal) links.push({ label: "PayPal", href: `https://paypal.me/${encodeURIComponent(p.paypal)}/${amt}${currency.toUpperCase()}` });
  if (p.venmo && currency.toLowerCase() === "usd")
    links.push({ label: "Venmo", href: `https://venmo.com/${encodeURIComponent(p.venmo)}?txn=pay&amount=${amt}&note=${encodeURIComponent(note)}` });
  return links;
}
