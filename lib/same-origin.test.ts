import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./same-origin";

const req = (headers: Record<string, string>) => new Request("https://trip.example.com/api/x", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("allows the app's own requests", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin", origin: "https://trip.example.com", host: "trip.example.com" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://trip.example.com", host: "trip.example.com" }))).toBe(true);
  });
  it("allows requests with neither header (scripts, tests)", () => {
    expect(isSameOrigin(req({}))).toBe(true);
  });
  it("refuses cross-site and same-site-other-origin requests", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(req({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "trip.example.com" }))).toBe(false);
  });
  it("uses the forwarded host behind a proxy, and refuses a junk origin", () => {
    expect(isSameOrigin(req({ origin: "https://trip.example.com", host: "internal:3000", "x-forwarded-host": "trip.example.com" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "not a url", host: "trip.example.com" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://trip.example.com" }))).toBe(false); // an Origin with no host to compare
  });
});
