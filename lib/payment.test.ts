import { describe, expect, it } from "vitest";
import { parsePayment, payLines, PaymentSchema, toPayment } from "./payment";

describe("validation", () => {
  it("accepts phone and account numbers with the usual punctuation", () => {
    expect(PaymentSchema.safeParse({ gcash: "0917 123 4567", maya: "+63 917-123-4567", maribank: "1234567890" }).success).toBe(true);
  });
  it("refuses letters and absurd lengths in number fields", () => {
    expect(PaymentSchema.safeParse({ gcash: "call me" }).success).toBe(false);
    expect(PaymentSchema.safeParse({ maya: "123" }).success).toBe(false);
    expect(PaymentSchema.safeParse({ maribank: "1".repeat(25) }).success).toBe(false);
  });
  it("bounds free text and refuses line breaks", () => {
    expect(PaymentSchema.safeParse({ qrph: "x".repeat(121) }).success).toBe(false);
    expect(PaymentSchema.safeParse({ other: "a\nb" }).success).toBe(false);
  });
});
describe("storage", () => {
  it("drops empty fields and returns null when nothing is left", () => {
    expect(toPayment({ gcash: "  ", other: "" })).toBeNull();
    expect(toPayment({ gcash: " 0917 123 4567 ", qrph: "Ana S." })).toEqual({ gcash: "0917 123 4567", qrph: "Ana S." });
  });
  it("reads the column defensively, dropping anything old, unknown or invalid", () => {
    expect(parsePayment(null)).toBeNull();
    expect(parsePayment([1])).toBeNull();
    expect(parsePayment({ paypal: "ana", venmo: "ana" })).toBeNull(); // the earlier version's keys
    expect(parsePayment({ gcash: "0917 123 4567", evil: "<script>", maya: "nope" })).toEqual({ gcash: "0917 123 4567" });
  });
});
describe("payLines", () => {
  it("lists the filled-in methods in a fixed order", () => {
    expect(payLines({ other: "BDO 123", gcash: "0917 123 4567" })).toEqual([
      { key: "gcash", label: "GCash", value: "0917 123 4567" },
      { key: "other", label: "Anything else", value: "BDO 123" },
    ]);
    expect(payLines(null)).toEqual([]);
  });
});
