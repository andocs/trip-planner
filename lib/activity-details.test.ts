import { describe, expect, it } from "vitest";
import { ideaForItem, kindOfType, placeOf, withPlace } from "./activity-details";

describe("activity details", () => {
  it("maps the Type chip to a category, with sight as the generic one", () => {
    expect(kindOfType("Food & Drink")).toBe("food");
    expect(kindOfType("Rest & Stay")).toBe("stay");
    for (const t of ["Sightseeing", "Activity", "Shopping", "Transport", "Other", null, ""]) expect(kindOfType(t)).toBe("sight");
  });
  it("reads and writes the category details without touching other keys", () => {
    expect(placeOf({ website: "https://x.example" })).toBeNull();
    expect(placeOf({ place: {} })).toBeNull();
    expect(placeOf({ place: { sightType: "nature" } })).toEqual({ sightType: "nature" });
    expect(withPlace({ website: "https://x.example" }, { sightType: "nature" })).toEqual({ website: "https://x.example", place: { sightType: "nature" } });
    expect(withPlace({ website: "https://x.example", place: { a: 1 } }, null)).toEqual({ website: "https://x.example" });
    expect(withPlace(null, {})).toEqual({});
  });
  it("makes a stand-in place from an activity's own details, and none without them", () => {
    const item = { type: "Food & Drink", activity: "Pho", city: "Hanoi", note: null, details: { place: { hours: "7 to 11" } } };
    expect(ideaForItem(item)).toMatchObject({ kind: "food", name: "Pho", details: { hours: "7 to 11" } });
    expect(ideaForItem({ ...item, details: {} })).toBeUndefined();
  });
  it("lays an activity's own details over the linked place", () => {
    const linked = { table: "attractions", id: "a", key: "attractions:a", kind: "sight", name: "Castle", city: null, price: 5, priceUnit: "person", decision: "draft", note: null, nights: null, total: null, details: { duration: "1h" }, dealBreaker: false, created_at: "" } as never;
    expect(ideaForItem({ type: null, activity: "Castle", city: null, note: null, details: { place: { duration: "2h" } } }, linked)).toMatchObject({ price: 5, details: { duration: "2h" } });
    expect(ideaForItem({ type: null, activity: "Castle", city: null, note: null, details: {} }, linked)).toBe(linked);
  });
});
