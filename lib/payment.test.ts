import { describe, expect, it } from "vitest";
import { normalizePaypal, normalizeVenmo, parsePayment, payLinks, PaymentSchema, toPayment } from "./payment";

describe("handles", () => {
  it("accepts a pasted link or @name", () => {
    expect(normalizePaypal("https://www.paypal.me/jam/20")).toBe("jam");
    expect(normalizePaypal("@jam")).toBe("jam");
    expect(normalizeVenmo("https://venmo.com/u/jam-d?x=1")).toBe("jam-d");
    expect(normalizeVenmo("@jam_d")).toBe("jam_d");
  });
  it("refuses odd characters", () => {
    expect(PaymentSchema.safeParse({ paypal: "a b" }).success).toBe(false);
    expect(PaymentSchema.safeParse({ venmo: "x".repeat(31) }).success).toBe(false);
    expect(PaymentSchema.safeParse({ other: "line\nbreak" }).success).toBe(false);
    expect(PaymentSchema.safeParse({ other: "x".repeat(121) }).success).toBe(false);
  });
});
describe("storage", () => {
  it("drops empty fields and returns null when nothing is left", () => {
    expect(toPayment({ paypal: "  ", other: "" })).toBeNull();
    expect(toPayment({ paypal: "jam", other: " GCash 0917 " })).toEqual({ paypal: "jam", other: "GCash 0917" });
  });
  it("reads the column defensively", () => {
    expect(parsePayment(null)).toBeNull();
    expect(parsePayment([1])).toBeNull();
    expect(parsePayment({ paypal: 5, evil: "<script>" })).toBeNull();
    expect(parsePayment({ paypal: "jam", extra: 1 })).toEqual({ paypal: "jam" });
    expect(parsePayment({ venmo: "bad name!" })).toBeNull();
  });
});
describe("payLinks", () => {
  it("fills in amount and currency", () => {
    expect(payLinks({ paypal: "jam" }, 12.345, "php", "Trip")).toEqual([{ label: "PayPal", href: "https://paypal.me/jam/12.35PHP" }]);
  });
  it("offers Venmo only in dollars", () => {
    expect(payLinks({ venmo: "jam" }, 5, "php", "Trip")).toEqual([]);
    expect(payLinks({ venmo: "jam" }, 5, "usd", "Hanoi trip")[0].href).toBe("https://venmo.com/jam?txn=pay&amount=5.00&note=Hanoi%20trip");
  });
  it("offers nothing for no amount or no handles", () => {
    expect(payLinks({ paypal: "jam" }, 0, "usd", "")).toEqual([]);
    expect(payLinks(null, 10, "usd", "")).toEqual([]);
  });
});
