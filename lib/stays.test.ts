import { describe, expect, it } from "vitest";
import type { IdeaRow } from "./stays";
import { isStayRow, staysOf, stayFromIdea, UNSTAY, validStatus } from "./stays";

const row = (over: Partial<IdeaRow> = {}): IdeaRow =>
  ({
    id: "h1",
    trip_id: "t",
    created_at: "2026-06-01T00:00:00Z",
    hotel: "Old Quarter Inn",
    city: "Hanoi",
    room: "ask for the quiet side",
    nights: 3,
    total: "9000.00" as unknown as number,
    decision: "confirmed",
    deal_breaker: false,
    details: { rooms: "Deluxe 201", cancellation: "free", freeUntil: "2026-06-14", stayType: "hotel" },
    is_stay: true,
    check_in: "2026-06-16",
    check_out: "2026-06-19",
    stay_status: "Booked",
    confirmation: "CONF-1",
    ...over,
  }) as IdeaRow;

describe("stayFromIdea: the stay a booked hotel idea stands for", () => {
  it("maps each field from where it lives on the idea row", () => {
    expect(stayFromIdea(row())).toMatchObject({
      id: "h1",
      hotel: "Old Quarter Inn",
      city: "Hanoi",
      note: "ask for the quiet side", // an idea's `room` column holds its notes
      room: "Deluxe 201", // the room is in details.rooms
      check_in: "2026-06-16",
      check_out: "2026-06-19",
      total: 9000, // numbers come back as numbers
      confirmation: "CONF-1",
      status: "Booked",
    });
  });
  it("carries the details through, so the cancellation terms and links still read", () => {
    expect(stayFromIdea(row()).details).toMatchObject({ cancellation: "free", freeUntil: "2026-06-14" });
  });
  it("copes with no rooms, no total and odd details", () => {
    const s = stayFromIdea(row({ details: null as never, total: null }));
    expect(s).toMatchObject({ room: null, total: null });
    expect(stayFromIdea(row({ details: { rooms: "   " } })).room).toBeNull();
    expect(stayFromIdea(row({ details: [] as never })).room).toBeNull();
  });
});

describe("staysOf / isStayRow", () => {
  it("only booked ideas are stays: drafts and ideas that were never booked stay on the board", () => {
    const rows = [row({ id: "a" }), row({ id: "b", is_stay: false }), row({ id: "c", is_stay: false, decision: "draft" })];
    expect(staysOf(rows).map((s) => s.id)).toEqual(["a"]);
    expect(isStayRow(row())).toBe(true);
    expect(isStayRow(row({ is_stay: false }))).toBe(false);
    expect(staysOf(undefined)).toEqual([]);
  });
  it("a cancelled stay is still a stay (the Stays screen shows it as cancelled)", () => {
    expect(staysOf([row({ stay_status: "Cancelled" })])).toHaveLength(1);
  });
});

describe("validStatus / UNSTAY", () => {
  it("keeps the four stay statuses and falls back to Planned", () => {
    for (const s of ["Planned", "Booked", "Done", "Cancelled"]) expect(validStatus(s)).toBe(s);
    for (const s of ["Idea", "weird", "", null, undefined]) expect(validStatus(s)).toBe("Planned");
  });
  it("taking a stay off the page clears the booking and leaves the idea alone", () => {
    expect(UNSTAY).toEqual({ is_stay: false, check_in: null, check_out: null, stay_status: "Planned", confirmation: null });
    for (const k of ["decision", "hotel", "details", "total", "room"]) expect(UNSTAY).not.toHaveProperty(k);
  });
});
