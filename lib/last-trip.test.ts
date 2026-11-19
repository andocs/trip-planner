import { describe, expect, it } from "vitest";
import { bareRedirect, rememberTripCookie } from "./last-trip";

const ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const none = new URLSearchParams();

describe("bareRedirect", () => {
  it("sends a bare screen to the remembered trip", () => {
    expect(bareRedirect("/itinerary", ID, none)).toBe(`/t/${ID}/itinerary`);
    expect(bareRedirect("/", ID, none)).toBe(`/t/${ID}`);
  });
  it("leaves addresses alone when nothing usable is remembered", () => {
    expect(bareRedirect("/itinerary", null, none)).toBeNull();
    expect(bareRedirect("/itinerary", "", none)).toBeNull();
    expect(bareRedirect("/itinerary", "not-a-trip", none)).toBeNull();
    expect(bareRedirect("/itinerary", "https://evil.example", none)).toBeNull();
  });
  it("only touches bare screens", () => {
    expect(bareRedirect(`/t/${ID}/places`, ID, none)).toBeNull();
    expect(bareRedirect("/join/abc", ID, none)).toBeNull();
    expect(bareRedirect("/share/abc", ID, none)).toBeNull();
    expect(bareRedirect("/login", ID, none)).toBeNull();
  });
  it("?latest asks for the trip joined last", () => {
    expect(bareRedirect("/", ID, new URLSearchParams("latest=1"))).toBeNull();
  });
});

describe("rememberTripCookie", () => {
  it("is Lax, site-wide and lasts a year; Secure only on https", () => {
    expect(rememberTripCookie(ID, false)).toBe(`tp-last-trip=${ID}; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(rememberTripCookie(ID, true)).toMatch(/; Secure$/);
  });
});
