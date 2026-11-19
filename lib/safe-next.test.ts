import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

const origin = "https://trip.example.com";

describe("safeNext", () => {
  it("keeps same-site paths, queries and hashes", () => {
    expect(safeNext("/", origin)).toBe("/");
    expect(safeNext("/itinerary?day=2#top", origin)).toBe("/itinerary?day=2#top");
  });

  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", "javascript:alert(1)", "/%5Cevil.com/.."])(
    "refuses %j",
    (raw) => {
      const out = safeNext(raw, origin);
      expect(new URL(out, origin).origin).toBe(origin);
      if (raw !== "/%5Cevil.com/..") expect(out).toBe("/");
    },
  );
});
