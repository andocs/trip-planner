import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const member = vi.hoisted(() => ({ id: "u1" as string | null, trips: null as string[] | null, asked: [] as string[] }));
// A member of the trips listed in `trips` (every trip when null), or nobody when `id` is null.
vi.mock("@/lib/supabase/require-user", () => ({
  requireMemberId: async (trip: string) => {
    member.asked.push(trip);
    return member.trips && !member.trips.includes(trip) ? null : member.id;
  },
}));

import { GET } from "./route";

const upstream = vi.fn();
const get = (qs: string, headers: Record<string, string> = {}) => GET(new Request(`https://trip.example.com/api/weather?${qs}`, { headers }));
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const TRIP = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const good = (lat = 21.0285, lng = 105.8542, from = day(2), to = day(3), trip = TRIP) => `trip=${trip}&lat=${lat}&lng=${lng}&from=${from}&to=${to}`;

beforeEach(() => {
  member.id = "u1";
  member.trips = null;
  member.asked = [];
  upstream.mockReset();
  upstream.mockImplementation(async () =>
    Response.json({ daily: { time: [day(2), day(3)], weather_code: [1, 2], temperature_2m_max: [30, 31], temperature_2m_min: [24, 25], precipitation_probability_max: [10, 20] } }),
  );
  vi.stubGlobal("fetch", upstream);
});

describe("GET /api/weather", () => {
  it("answers a member with the days", async () => {
    const res = await get(good());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: { date: string; kind: string }[] };
    expect(body.days.map((d) => d.kind)).toEqual(["forecast", "forecast"]);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("rounds the place to about a kilometre BEFORE it goes to the weather service", async () => {
    await get(good(21.028511, 105.854234, day(8), day(9))); // its own dates: the first test's answer is cached
    const sent = new URL(String(upstream.mock.calls[0][0]));
    expect(sent.searchParams.get("latitude")).toBe("21.03");
    expect(sent.searchParams.get("longitude")).toBe("105.85");
    expect(sent.href).not.toContain(TRIP); // the trip id is for our own membership check only, never sent on
  });

  it("is not an open proxy: someone who has not joined a trip is refused, and nothing is fetched", async () => {
    member.id = null;
    const res = await get(good());
    expect(res.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("is checked against the trip in the request: a member of one trip is refused for another", async () => {
    member.trips = [TRIP];
    expect((await get(good())).status).toBe(200);
    const res = await get(good(21.0285, 105.8542, day(2), day(3), OTHER));
    expect(res.status).toBe(401);
    expect(member.asked).toEqual([TRIP, OTHER]);
  });

  it("needs a trip id, and refuses one that is not an id, before anything else", async () => {
    for (const qs of [`lat=1&lng=2&from=${day(2)}&to=${day(3)}`, `trip=not-an-id&lat=1&lng=2&from=${day(2)}&to=${day(3)}`]) expect((await get(qs)).status).toBe(400);
    expect(member.asked).toEqual([]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a request that came from another site", async () => {
    const res = await get(good(), { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["a place that is not on Earth", `trip=${TRIP}&lat=100&lng=0&from=${day(2)}&to=${day(3)}`],
    ["a longitude out of range", `trip=${TRIP}&lat=0&lng=200&from=${day(2)}&to=${day(3)}`],
    ["text for a coordinate", `trip=${TRIP}&lat=abc&lng=0&from=${day(2)}&to=${day(3)}`],
    ["a date that does not exist", `trip=${TRIP}&lat=1&lng=2&from=2026-02-30&to=2026-03-02`],
    ["dates the wrong way round", `trip=${TRIP}&lat=1&lng=2&from=${day(5)}&to=${day(2)}`],
    ["a range longer than a month", `trip=${TRIP}&lat=1&lng=2&from=${day(2)}&to=${day(40)}`],
    ["nothing at all", ""],
  ])("refuses %s", async (_, qs) => {
    expect((await get(qs)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("remembers an answer for the same place and dates instead of asking again", async () => {
    const qs = good(10.5, 20.5, day(4), day(5));
    await get(qs);
    await get(qs);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("when the weather service is down it says so plainly, without passing its error on", async () => {
    upstream.mockImplementation(async () => new Response("SECRET upstream detail", { status: 500 }));
    const res = await get(good(30.1, 40.1, day(6), day(7)));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET");
  });

  it("slows a runaway page down with a plain message", async () => {
    member.id = "chatty";
    let last = 200;
    for (let i = 0; i < 70 && last !== 429; i++) last = (await get(good(i % 80, i % 170, day(2), day(3)))).status;
    expect(last).toBe(429);
  });
});
