import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The routes are server-only modules; these tests run them with the session, the database and Google replaced.
vi.mock("server-only", () => ({}));
const requireUserId = vi.fn();
vi.mock("@/lib/supabase/require-user", () => ({ requireUserId: () => requireUserId() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServer: async () => ({ rpc }) }));

// Built at run time so this file never contains a key-shaped string.
const KEY = "AI" + "zaSy" + "k".repeat(33);
const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const place = (over: Record<string, unknown> = {}) => ({
  id: "ChIJ-abcdefghij",
  displayName: { text: "Temple of Literature" },
  location: { latitude: 21.03, longitude: 105.83 },
  formattedAddress: "58 Quốc Tử Giám",
  googleMapsUri: "https://maps.google.com/?cid=1",
  primaryType: "tourist_attraction",
  rating: 4.6,
  userRatingCount: 100,
  regularOpeningHours: { openNow: true },
  photos: [
    { name: "places/ChIJ-abcdefghij/photos/AaBb-cc_dd1234567890", authorAttributions: [{ displayName: "Minh" }] },
  ],
  ...over,
});

const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let googleFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  requireUserId.mockResolvedValue("owner-1");
  rpc.mockResolvedValue({ data: "ok", error: null });
  process.env.GOOGLE_MAPS_SERVER_KEY = KEY;
  delete process.env.GOOGLE_PLACES_BASE_URL;
  googleFetch = vi.fn(async () => okJson({ places: [place()] }));
  vi.stubGlobal("fetch", googleFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

const search = async (body: unknown = { kind: "sight", city: { name: "Hanoi", lat: 21, lng: 105 } }) => {
  const { POST } = await import("@/app/api/places/search/route");
  return POST(post("/api/places/search", body));
};

describe("POST /api/places/search", () => {
  it("lets only the signed-in owner in, and calls nothing for anyone else", async () => {
    requireUserId.mockResolvedValue(null);
    const res = await search();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(rpc).not.toHaveBeenCalled();
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid body before it spends a call or reaches Google", async () => {
    for (const body of [
      "not json{",
      {},
      { kind: "spa", city: { name: "x", lat: 1, lng: 1 } },
      { kind: "food", city: { name: "x", lat: 999, lng: 1 } },
    ]) {
      const res = await search(body);
      expect(res.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("says 'not set up' without spending a call when there is no key", async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    const res = await search();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends the key only in the X-Goog-Api-Key header, with the card field mask, and never returns it", async () => {
    const res = await search();
    expect(res.status).toBe(200);
    expect(googleFetch).toHaveBeenCalledTimes(1);
    const [url, init] = googleFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(String(url)).not.toContain(KEY);
    expect(String(url)).not.toMatch(/key=/i);
    const h = init.headers as Record<string, string>;
    expect(h["X-Goog-Api-Key"]).toBe(KEY);
    expect(h["X-Goog-FieldMask"]).toContain("places.rating");
    expect(String(init.body)).not.toContain(KEY);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    const body = JSON.parse(text);
    expect(body.places).toHaveLength(1);
    expect(body.places[0]).toMatchObject({ id: "ChIJ-abcdefghij", name: "Temple of Literature", rating: 4.6 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reserves one unit of the Text Search cap before it calls Google", async () => {
    await search();
    expect(rpc).toHaveBeenCalledWith("reserve_api_call", { p_sku: "text_search_atmosphere" });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(googleFetch.mock.invocationCallOrder[0]);
  });

  it("fails closed: at the monthly cap, over the rate limit, or if the guard itself errors, Google is not called", async () => {
    rpc.mockResolvedValueOnce({ data: "cap", error: null });
    let res = await search();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("cap");

    rpc.mockResolvedValueOnce({ data: "rate", error: null });
    res = await search();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate");

    rpc.mockResolvedValueOnce({ data: null, error: { message: "function reserve_api_call does not exist" } });
    res = await search();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");

    rpc.mockResolvedValueOnce({ data: "something-else", error: null });
    res = await search();
    expect(res.status).toBe(502);

    rpc.mockRejectedValueOnce(new Error("network down"));
    res = await search();
    expect(res.status).toBe(502);

    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("turns any Google failure into a generic error and never forwards Google's body, headers or URL", async () => {
    const secret = `API key not valid. Please pass a valid API key. (${KEY}) https://places.googleapis.com/v1/places:searchText?key=${KEY}`;
    for (const status of [400, 403, 429, 500]) {
      googleFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: secret, status: "PERMISSION_DENIED" } }), {
          status,
          headers: { "X-Secret-Header": KEY },
        }),
      );
      const res = await search();
      const text = await res.text();
      expect(res.status).toBe(502);
      expect(JSON.parse(text)).toEqual({
        error: "unavailable",
        message: "Couldn't reach Google Maps. Your board and itinerary are fine.",
      });
      expect(text).not.toContain(KEY);
      expect(text).not.toMatch(/API key not valid|googleapis|PERMISSION/i);
      expect(res.headers.get("X-Secret-Header")).toBeNull();
    }
    googleFetch.mockRejectedValueOnce(new Error(`connect ECONNREFUSED ${KEY}`));
    const res = await search();
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(KEY);
  });

  it("drops anything unexpected in Google's answer instead of passing it through", async () => {
    googleFetch.mockResolvedValueOnce(
      okJson({
        places: [place({ googleMapsUri: "https://evil.example/x", sneaky: "<script>" }), "junk", { id: "x" }],
        debug: KEY,
      }),
    );
    const res = await search();
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.places).toHaveLength(1);
    expect(body.places[0].mapsUri).toBeNull();
    expect(text).not.toContain("sneaky");
    expect(text).not.toContain(KEY);
  });
});

describe("POST /api/places/photo", () => {
  const photo = async (body: unknown) => {
    const { POST } = await import("@/app/api/places/photo/route");
    return POST(post("/api/places/photo", body));
  };
  const name = "places/ChIJ-abcdefghij/photos/AaBb-cc_dd1234567890";

  it("asks Google for a keyless photoUri (skipHttpRedirect) with the key in the header only", async () => {
    googleFetch.mockResolvedValueOnce(okJson({ name, photoUri: "https://lh3.googleusercontent.com/places/x=s640" }));
    const res = await photo({ name });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uri: "https://lh3.googleusercontent.com/places/x=s640" });
    const [url, init] = googleFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("skipHttpRedirect=true");
    expect(String(url)).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(KEY);
    expect(rpc).toHaveBeenCalledWith("reserve_api_call", { p_sku: "photos" });
  });

  it("never hands the browser a URL that carries a key", async () => {
    for (const bad of [
      `https://places.googleapis.com/v1/x/media?key=${KEY}&maxWidthPx=400`,
      "http://lh3.googleusercontent.com/x",
      undefined,
    ]) {
      googleFetch.mockResolvedValueOnce(okJson({ photoUri: bad }));
      const res = await photo({ name });
      const text = await res.text();
      expect(res.status).toBe(502);
      expect(text).not.toContain(KEY);
    }
  });

  it("refuses a photo name that could change the request path", async () => {
    for (const bad of [
      "../../v1/places:searchText",
      "places/x/photos/../../y",
      `https://evil.example/${name}`,
      "places/ChIJ-abcdefghij/photos/a b",
    ]) {
      expect((await photo({ name: bad })).status).toBe(400);
    }
    expect(googleFetch).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/places/details", () => {
  it("reserves an Enterprise call and returns only the weekly hours", async () => {
    googleFetch.mockResolvedValueOnce(
      okJson({
        id: "ChIJ-abcdefghij",
        regularOpeningHours: { openNow: false, weekdayDescriptions: ["Monday: 8:00 AM – 5:00 PM"] },
        reviews: ["never returned"],
      }),
    );
    const { POST } = await import("@/app/api/places/details/route");
    const res = await POST(post("/api/places/details", { placeId: "ChIJ-abcdefghij" }));
    expect(rpc).toHaveBeenCalledWith("reserve_api_call", { p_sku: "details_enterprise" });
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      id: "ChIJ-abcdefghij",
      weekdayText: ["Monday: 8:00 AM – 5:00 PM"],
      openNow: false,
    });
    expect(text).not.toContain("never returned");
    const [url, init] = googleFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places/ChIJ-abcdefghij");
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("id,regularOpeningHours");
  });

  it("refuses a place id that is not a plain id", async () => {
    const { POST } = await import("@/app/api/places/details/route");
    expect((await POST(post("/api/places/details", { placeId: "abc/../def?key=1" }))).status).toBe(400);
    expect(googleFetch).not.toHaveBeenCalled();
  });
});
