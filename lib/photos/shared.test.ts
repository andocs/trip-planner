import { describe, expect, it } from "vitest";
import { closeGaps, coverMoves, creditText, fitWithin, formatBytes, nextPosition, sourceLabel } from "./shared";

const r = (id: string, position: number, at = "2026-01-01T00:00:00Z") => ({ id, position, created_at: at });

describe("sizing", () => {
  it("shrinks the longer side to 1280 and keeps the shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
  it("never scales up and never reaches zero", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(100000, 1)).toEqual({ width: 1280, height: 1 });
  });
  it("formats sizes", () => {
    expect(formatBytes(212_000)).toBe("207 KB");
    expect(formatBytes(38 * 1024 * 1024)).toBe("38 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
  });
});

describe("cover and order", () => {
  it("makes a photo the cover and keeps the others in order", () => {
    expect(coverMoves([r("a", 0), r("b", 1), r("c", 2)], "c")).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });
  it("changes nothing when it already is the cover, or the photo is unknown", () => {
    expect(coverMoves([r("a", 0), r("b", 1)], "a")).toEqual([]);
    expect(coverMoves([r("a", 0)], "zzz")).toEqual([]);
  });
  it("breaks ties by age", () => {
    expect(
      coverMoves([r("a", 0, "2026-01-02T00:00:00Z"), r("b", 0, "2026-01-01T00:00:00Z"), r("c", 1)], "c").map(
        (m) => m.id,
      ),
    ).toEqual(["c", "b", "a"]);
  });
  it("closes the gap after a removal", () => {
    expect(closeGaps([r("b", 1), r("c", 2)])).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 1 },
    ]);
    expect(closeGaps([r("a", 0), r("b", 1)])).toEqual([]);
  });
  it("puts a new photo last", () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 0 }, { position: 4 }])).toBe(5);
  });
});

describe("credits", () => {
  it("credits Wikimedia photos with author, licence and the Commons name", () => {
    expect(creditText({ source: "wikimedia", credit: "Dung Nguyen", license: "CC BY-SA 4.0" })).toBe(
      "Photo: Dung Nguyen, CC BY-SA 4.0 · Wikimedia Commons",
    );
    expect(creditText({ source: "wikimedia", credit: null, license: null })).toBe(
      "Photo: Unknown author · Wikimedia Commons",
    );
  });
  it("names the site for a link, and has no credit line for your own upload", () => {
    expect(creditText({ source: "link", credit: "booking.com", license: null })).toBe("Photo from booking.com");
    expect(creditText({ source: "link", credit: null, license: null })).toBe("Photo from a link");
    expect(creditText({ source: "upload", credit: null, license: null })).toBeNull();
  });
  it("labels where a photo came from", () => {
    expect(sourceLabel({ source: "upload", credit: null, license: null })).toBe("Uploaded");
    expect(sourceLabel({ source: "link", credit: "booking.com", license: null })).toBe("via booking.com");
    expect(sourceLabel({ source: "wikimedia", credit: "A", license: "CC0" })).toBe("A · CC0");
  });
});
