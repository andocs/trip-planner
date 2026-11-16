import { describe, expect, it } from "vitest";
import { legacyRedirect } from "./legacy-routes";

const go = (path: string) => {
  const u = new URL(path, "http://x");
  return legacyRedirect(u.pathname, u.searchParams);
};

describe("legacyRedirect", () => {
  it("splits /plan into Itinerary, Flights and Stays", () => {
    expect(go("/plan")).toBe("/itinerary");
    expect(go("/plan?tab=itinerary")).toBe("/itinerary");
    expect(go("/plan?tab=flights")).toBe("/flights");
    expect(go("/plan?tab=stays")).toBe("/stays");
  });

  it("turns the old tabs into Places categories", () => {
    expect(go("/plan?tab=ideas")).toBe("/places?cat=stay");
    expect(go("/places?tab=food")).toBe("/places?cat=food");
    expect(go("/places?tab=attractions")).toBe("/places?cat=sight");
  });

  it("leaves current addresses alone", () => {
    expect(go("/places")).toBeNull();
    expect(go("/places?tab=discover")).toBeNull();
    expect(go("/places?cat=food")).toBeNull();
    expect(go("/itinerary")).toBeNull();
    expect(go("/")).toBeNull();
  });
});
