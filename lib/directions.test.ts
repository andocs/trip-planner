import { describe, expect, it } from "vitest";
import { directionsUrl } from "./itinerary";

describe("directionsUrl", () => {
  it("needs at least two stops", () => {
    expect(directionsUrl([])).toBeNull();
    expect(directionsUrl([{ lat: 21.03, lng: 105.85 }])).toBeNull();
  });
  it("lists the stops in the order given", () => {
    expect(
      directionsUrl([
        { lat: 21.03, lng: 105.85 },
        { lat: 20.25, lng: 105.97 },
        { lat: 22.33, lng: 103.84 },
      ]),
    ).toBe("https://www.google.com/maps/dir/21.03,105.85/20.25,105.97/22.33,103.84");
  });
});
