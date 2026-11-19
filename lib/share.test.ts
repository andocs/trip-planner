import { describe, expect, it } from "vitest";
import { groupShared, parseShared } from "./share";

const raw = {
  trip: { name: "Vietnam '26", destination: "Vietnam", start_date: "2026-06-16", end_date: "2026-06-26", timezone: "Asia/Manila" },
  itinerary: [
    { day: 2, on_date: null, at_time: "09:30:00", duration_min: 90, activity: "Lake walk", city: "Hanoi", type: "nature", tentative: false },
    { day: 1, on_date: null, at_time: null, duration_min: null, activity: "Arrive", city: null, type: null, tentative: true },
    { day: null, on_date: "2026-06-30", at_time: null, duration_min: null, activity: "Undated", city: null, type: null, tentative: false },
    { day: 1, activity: "   " }, // no name: dropped
  ],
  flights: [{ airline: "Cebu Pacific", flight_no: "5J 111", from_code: "MNL", to_code: "HAN", departs_at: "2026-06-16T09:40", arrives_at: null, terminal: "3", status: "Booked", fare: 5000, booking_ref: "PNR1" }],
  stays: [{ hotel: "Old Quarter Inn", city: "Hanoi", check_in: "2026-06-16", check_out: "2026-06-19", confirmation: "CONF9", total: 9000 }],
};

describe("parseShared", () => {
  it("reads the trip, itinerary, flights and stays", () => {
    const t = parseShared(raw)!;
    expect(t).toMatchObject({ name: "Vietnam '26", startDate: "2026-06-16", endDate: "2026-06-26" });
    expect(t.itinerary).toHaveLength(3);
    expect(t.flights[0]).toMatchObject({ from: "MNL", to: "HAN", flightNo: "5J 111", status: "Booked" });
    expect(t.stays[0]).toMatchObject({ hotel: "Old Quarter Inn", checkOut: "2026-06-19" });
  });
  it("keeps only the fields it knows, so a private one added by mistake still never reaches the page", () => {
    const text = JSON.stringify(parseShared(raw));
    for (const secret of ["fare", "5000", "booking_ref", "PNR1", "confirmation", "CONF9", "9000"]) expect(text).not.toContain(secret);
  });
  it.each([null, undefined, "x", 5, [], {}, { trip: null }, { trip: { name: "" } }, { trip: { name: 7 } }])("treats %j as no trip", (v) => {
    expect(parseShared(v)).toBeNull();
  });
  it("survives missing or wrongly typed lists and values", () => {
    const t = parseShared({ trip: { name: "T" }, itinerary: "nope", flights: [1, null, "x"], stays: [{}] })!;
    expect(t.itinerary).toEqual([]);
    expect(t.flights).toHaveLength(0);
    expect(t.stays).toEqual([]);
  });
  it("caps absurd text lengths", () => {
    const t = parseShared({ trip: { name: "x".repeat(5000) } })!;
    expect(t.name).toHaveLength(120);
  });
});

describe("groupShared", () => {
  it("groups by day in order, with undated stops last, and works out each day's date", () => {
    const days = groupShared(parseShared(raw)!.itinerary, "2026-06-16");
    expect(days.map((d) => d.day)).toEqual([1, 2, null]);
    expect(days.map((d) => d.date)).toEqual(["2026-06-16", "2026-06-17", "2026-06-30"]);
    expect(days[0].stops[0].activity).toBe("Arrive");
  });
  it("has no dates when the trip has no start", () => {
    expect(groupShared(parseShared(raw)!.itinerary, null).map((d) => d.date)).toEqual([null, null, "2026-06-30"]);
  });
});
