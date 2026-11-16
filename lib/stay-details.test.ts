import { describe, expect, it } from "vitest";
import { buildStayDetails, cancellationFact, checkInFact, isBooked, parseStayDetails } from "./stay-details";

describe("parseStayDetails", () => {
  it("keeps known fields and reads damage as empty", () => {
    expect(parseStayDetails({ cancellation: "free", freeUntil: "2026-06-15", junk: 1 })).toEqual({ cancellation: "free", freeUntil: "2026-06-15" });
    expect(parseStayDetails({ freeUntil: "tomorrow" })).toEqual({});
    expect(parseStayDetails("x")).toEqual({});
    expect(parseStayDetails(null)).toEqual({});
  });
});

describe("buildStayDetails", () => {
  it("stores only what was filled in, and a free-until date only for free cancellation", () => {
    expect(buildStayDetails({ cancellation: "free", freeUntil: "2026-06-15", checkInTime: "14:00", breakfast: true })).toEqual({
      cancellation: "free",
      freeUntil: "2026-06-15",
      checkInTime: "14:00",
      breakfast: true,
    });
    expect(buildStayDetails({ cancellation: "partial", freeUntil: "2026-06-15", checkInTime: "", breakfast: false })).toEqual({ cancellation: "partial" });
    expect(buildStayDetails({ cancellation: "", freeUntil: null, checkInTime: "", breakfast: false })).toEqual({});
  });
});

describe("checkInFact", () => {
  it("says today, tomorrow, soon, staying now, and nothing when far off or unknown", () => {
    expect(checkInFact("2026-06-19", "2026-06-22", "2026-06-19")).toEqual({ label: "Check-in today", tone: "ok" });
    expect(checkInFact("2026-06-19", "2026-06-22", "2026-06-18")).toEqual({ label: "Check-in tomorrow", tone: "ok" });
    expect(checkInFact("2026-06-19", "2026-06-22", "2026-06-16")).toEqual({ label: "Check-in in 3 days" });
    expect(checkInFact("2026-06-19", "2026-06-22", "2026-06-20")).toEqual({ label: "Staying now", tone: "ok" });
    expect(checkInFact("2026-06-19", "2026-06-22", "2026-06-23")).toBeNull();
    expect(checkInFact("2026-06-19", "2026-06-22", "2026-05-01")).toBeNull();
    expect(checkInFact(null, null, "2026-06-18")).toBeNull();
    expect(checkInFact("2026-06-19", "2026-06-22", null)).toBeNull();
  });
});

describe("cancellationFact", () => {
  it("shows the deadline, and warns once it has passed", () => {
    expect(cancellationFact({ cancellation: "free", freeUntil: "2026-06-15" }, "2026-06-10")).toEqual({ label: "Free cancellation until 15 Jun", tone: "ok" });
    expect(cancellationFact({ cancellation: "free", freeUntil: "2026-06-15" }, "2026-06-16")).toEqual({ label: "Free cancellation ended", tone: "warn" });
    expect(cancellationFact({ cancellation: "free" }, null)).toEqual({ label: "Free cancellation", tone: "ok" });
    expect(cancellationFact({ cancellation: "non-refundable" }, null)).toEqual({ label: "Non-refundable", tone: "warn" });
    expect(cancellationFact({ cancellation: "partial" }, null)).toEqual({ label: "Partial refund" });
    expect(cancellationFact({}, null)).toBeNull();
  });
});

describe("isBooked", () => {
  it("counts Booked and Done", () => {
    expect([isBooked("Booked"), isBooked("Done"), isBooked("Planned"), isBooked("Priced")]).toEqual([true, true, false, false]);
  });
});
