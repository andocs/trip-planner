import { describe, expect, it } from "vitest";
import { screenPath, tripIdFromPath, withTrip } from "./trip-path";

const ID = "11111111-1111-4111-8111-111111111111";

describe("trip addresses", () => {
  it("reads the trip id from /t/<id>/..., and nothing from bare or look-alike paths", () => {
    expect(tripIdFromPath(`/t/${ID}`)).toBe(ID);
    expect(tripIdFromPath(`/t/${ID}/itinerary`)).toBe(ID);
    expect(tripIdFromPath(`/t/${ID.toUpperCase()}/spend`)).toBe(ID);
    for (const p of ["/", "/itinerary", "/t/abc/itinerary", `/t/${ID}x`, `/x/t/${ID}`, "/t/", null, undefined, ""]) expect(tripIdFromPath(p)).toBeNull();
  });
  it("gives the screen part of an address", () => {
    expect(screenPath(`/t/${ID}`)).toBe("/");
    expect(screenPath(`/t/${ID}/`)).toBe("/");
    expect(screenPath(`/t/${ID}/places`)).toBe("/places");
    expect(screenPath("/places")).toBe("/places");
    expect(screenPath(null)).toBe("/");
  });
  it("puts a link inside the open trip, or leaves it bare", () => {
    expect(withTrip(ID, "/itinerary")).toBe(`/t/${ID}/itinerary`);
    expect(withTrip(ID, "/")).toBe(`/t/${ID}`);
    expect(withTrip(null, "/itinerary")).toBe("/itinerary");
    expect(withTrip(ID, "https://example.com/x")).toBe("https://example.com/x");
    expect(withTrip(ID, "#main")).toBe("#main");
  });
});
