/**
 * How a traveler likes to be paid back: the Philippine wallets and banks this group uses. None of them has a public link that
 * fills in an amount, so Settle up shows the number or account to copy next to the amount owed. Pure: nothing is sent anywhere.
 * Details are visible to everyone on the trip (that is the point), so they hold phone or account numbers only, never a
 * password, PIN or card number.
 */
import { z } from "zod";

export type Payment = { gcash?: string; maya?: string; maribank?: string; qrph?: string; other?: string };

export const METHODS = [
  { key: "gcash", label: "GCash", hint: "Mobile number, e.g. 0917 123 4567" },
  { key: "maya", label: "Maya", hint: "Mobile number" },
  { key: "maribank", label: "MariBank", hint: "Account number" },
  { key: "qrph", label: "QR Ph", hint: "Name on the QR, or where to find it" },
  { key: "other", label: "Anything else", hint: "Bank name and account, for example" },
] as const satisfies readonly { key: keyof Payment; label: string; hint: string }[];

const clean = (s: string) => s.trim();
const NUMBER = /^[0-9+\-() ]{6,24}$/;

const number = (label: string) =>
  z.string().transform(clean).refine((v) => v === "" || NUMBER.test(v), `${label}: digits only (spaces, + and - are fine), 6 to 24 characters`).optional();
const text = z
  .string()
  .transform(clean)
  .refine((v) => v.length <= 120, "Keep it under 120 characters")
  .refine((v) => !/[\u0000-\u001f]/.test(v), "No line breaks")
  .optional();

export const PaymentSchema = z.object({
  gcash: number("GCash number"),
  maya: number("Maya number"),
  maribank: number("MariBank account"),
  qrph: text,
  other: text,
});

/** The stored value for a form's fields: empty ones dropped, null when nothing is left. */
export function toPayment(input: Payment): Payment | null {
  const out: Payment = {};
  for (const { key } of METHODS) {
    const v = input[key]?.trim();
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Reads the jsonb column defensively: unknown keys are ignored and a value that fails the rules is dropped. */
export function parsePayment(raw: unknown): Payment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Payment = {};
  for (const { key } of METHODS) {
    const v = r[key];
    if (typeof v !== "string") continue;
    const one = PaymentSchema.safeParse({ [key]: v });
    if (one.success) out[key] = one.data[key];
  }
  return toPayment(out);
}

/** What to show for a person: one labelled line per method they filled in. */
export function payLines(p: Payment | null): { key: keyof Payment; label: string; value: string }[] {
  if (!p) return [];
  return METHODS.flatMap((m) => (p[m.key] ? [{ key: m.key, label: m.label, value: p[m.key]! }] : []));
}
