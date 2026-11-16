import { describe, expect, it } from "vitest";
import type { Idea } from "./drafts";
import type { Item } from "./itinerary";
import { autoReminders } from "./reminders";

const today = "2026-06-10";
const stay = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  hotel: "Old Quarter",
  status: "Booked",
  check_in: "2026-06-20",
  check_out: "2026-06-23",
  details: {},
  ...over,
});
const idea = (over: Partial<Idea> = {}): Idea => ({
  table: "attractions",
  id: "a1",
  key: "attractions:a1",
  kind: "sight",
  name: "Trang An",
  city: null,
  price: null,
  priceUnit: null,
  decision: "confirmed",
  note: null,
  nights: null,
  total: null,
  details: {},
  dealBreaker: false,
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});
const titles = (r: ReturnType<typeof autoReminders>) => r.map((x) => `${x.kind}: ${x.title} | ${x.detail}`);

describe("stays", () => {
  it("reminds about check-in today and tomorrow only", () => {
    expect(titles(autoReminders({ stays: [stay({ check_in: "2026-06-10" })], ideas: [] }, today))).toEqual(["checkin: Check-in today | Old Quarter"]);
    expect(titles(autoReminders({ stays: [stay({ check_in: "2026-06-11" })], ideas: [] }, today))).toEqual(["checkin: Check-in tomorrow | Old Quarter"]);
    expect(autoReminders({ stays: [stay({ check_in: "2026-06-12" })], ideas: [] }, today)).toEqual([]);
  });

  it("warns when free cancellation is about to end, and not before or after", () => {
    const d = (freeUntil: string) => ({ cancellation: "free", freeUntil });
    expect(titles(autoReminders({ stays: [stay({ details: d("2026-06-12") })], ideas: [] }, today))).toEqual(["cancel: Free cancellation ends in 2 days | Old Quarter"]);
    expect(titles(autoReminders({ stays: [stay({ details: d("2026-06-10") })], ideas: [] }, today))).toEqual(["cancel: Free cancellation ends today | Old Quarter"]);
    expect(autoReminders({ stays: [stay({ details: d("2026-06-20") })], ideas: [] }, today)).toEqual([]);
    expect(autoReminders({ stays: [stay({ details: d("2026-06-09") })], ideas: [] }, today)).toEqual([]);
    expect(autoReminders({ stays: [stay({ details: { cancellation: "partial", freeUntil: "2026-06-11" } })], ideas: [] }, today)).toEqual([]);
  });

  it("nags about a stay that is not booked once check-in is within a month", () => {
    expect(titles(autoReminders({ stays: [stay({ status: "Planned", check_in: "2026-06-25" })], ideas: [] }, today))).toEqual(["unbooked: Not booked yet | Old Quarter · check-in in 15 days"]);
    expect(autoReminders({ stays: [stay({ status: "Planned", check_in: "2026-08-25" })], ideas: [] }, today)).toEqual([]);
    expect(autoReminders({ stays: [stay({ status: "Booked", check_in: "2026-06-25" })], ideas: [] }, today)).toEqual([]);
  });

  it("ignores cancelled stays and stays that are over", () => {
    expect(autoReminders({ stays: [stay({ status: "Cancelled", check_in: "2026-06-10" })], ideas: [] }, today)).toEqual([]);
    expect(autoReminders({ stays: [stay({ status: "Planned", check_in: "2026-06-01", check_out: "2026-06-05" })], ideas: [] }, today)).toEqual([]);
  });
});

describe("ideas", () => {
  it("asks for tickets and reservations that are needed but not booked, for confirmed ideas only", () => {
    const r = autoReminders(
      {
        stays: [],
        ideas: [
          idea({ details: { ticketsNeeded: true } }),
          idea({ id: "f1", key: "food_places:f1", kind: "food", table: "food_places", name: "Bun cha", details: { reservationNeeded: true } }),
          idea({ id: "a2", key: "attractions:a2", name: "Booked already", details: { ticketsNeeded: true, ticketsBooked: true } }),
          idea({ id: "a3", key: "attractions:a3", name: "Still a draft", decision: "draft", details: { ticketsNeeded: true } }),
        ],
      },
      today,
    );
    expect(titles(r)).toEqual(["tickets: Tickets needed | Trang An", "reservation: Reservation needed | Bun cha"]);
    expect(r[0].href).toBe("/places?cat=sight&idea=attractions:a1");
  });
});

describe("ordering and ids", () => {
  it("puts what is soonest first, undated last, with stable ids", () => {
    const r = autoReminders(
      {
        stays: [stay({ id: "late", check_in: "2026-06-11" }), stay({ id: "now", check_in: "2026-06-10", hotel: "Now Inn" })],
        ideas: [idea({ details: { ticketsNeeded: true } })],
      },
      today,
    );
    expect(r.map((x) => x.id)).toEqual(["checkin:now", "checkin:late", "tickets:attractions:a1"]);
  });
});

describe("a packed day", () => {
  const START = "2026-06-10"; // Day 1 is today
  const item = (day: number, duration_min: number, over: Partial<Item> = {}): Item => ({
    id: `x${day}-${duration_min}-${Math.random()}`,
    day,
    at_time: null,
    activity: "x",
    duration_min,
    created_at: "2026-06-01T00:00:00Z",
    kind: "stop",
    ...over,
  });
  it("reminds about an upcoming day over the limit, counting commutes and breaks, not tentative stops", () => {
    const r = autoReminders(
      {
        stays: [],
        ideas: [],
        start: START,
        items: [item(2, 400), item(2, 150, { kind: "commute" }), item(2, 100, { kind: "buffer" }), item(2, 900, { tentative: true })],
      },
      today,
    );
    expect(titles(r)).toEqual(["longday: Day 2 is packed | 10h 50m planned, over 10h"]);
    expect(r[0]).toMatchObject({ id: "longday:2", days: 1, href: "/itinerary" });
  });
  it("says nothing for a day at the limit, a day that has passed, or a trip with no start date", () => {
    expect(autoReminders({ stays: [], ideas: [], start: START, items: [item(2, 600)] }, today)).toEqual([]);
    expect(autoReminders({ stays: [], ideas: [], start: "2026-06-01", items: [item(2, 700)] }, today)).toEqual([]); // Day 2 was 2 Jun
    expect(autoReminders({ stays: [], ideas: [], start: null, items: [item(2, 700)] }, today)).toEqual([]);
    // Day 9 is 18 Jun, eight days away: too far ahead to nag about yet.
    expect(autoReminders({ stays: [], ideas: [], start: START, items: [item(9, 700)] }, today)).toEqual([]);
    expect(titles(autoReminders({ stays: [], ideas: [], start: START, items: [item(8, 700)] }, today))).toEqual(["longday: Day 8 is packed | 11h 40m planned, over 10h"]);
  });
});
