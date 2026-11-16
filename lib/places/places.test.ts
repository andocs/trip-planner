import { describe, expect, it } from "vitest";
import { DETAILS_MASK, SEARCH_MASK, tierOf } from "./fields";
import { keylessPhotoUri, mapsLinkFor, safeMapsUri, toCard, toCards, typeLabel } from "./normalize";
import { DetailsBody, ImageBody, PhotoBody, PhotoName, PlaceId, SearchBody } from "./schemas";
import { isFreeLicense, nameMatch, pickPhoto, stripHtml, tokens, type CommonsFile } from "./wiki-pick";

describe("billing tiers", () => {
  it("bills the card search at Enterprise+Atmosphere (the description) and the hours lookup at Enterprise", () => {
    expect(tierOf(SEARCH_MASK)).toBe("Enterprise+Atmosphere");
    expect(tierOf(DETAILS_MASK)).toBe("Enterprise");
  });
  it("lists photo references at the free IDs Only tier", () => {
    expect(tierOf("places.photos")).toBe("IDs Only");
    expect(tierOf("places.id")).toBe("IDs Only");
  });
  it("uses the highest tier of any field in the mask", () => {
    expect(tierOf("places.id,places.location")).toBe("Essentials");
    expect(tierOf("places.id,places.displayName")).toBe("Pro");
  });
  it("refuses a field it has no billing tier for, so a mask can't quietly get more expensive", () => {
    expect(() => tierOf("places.id,places.reviewSummary")).toThrow(/Unknown Places field/);
  });
  it("asks for the short description in the search only, never for reviews, and never in the hours lookup", () => {
    expect(SEARCH_MASK).toContain("places.editorialSummary");
    expect(SEARCH_MASK).not.toMatch(/reviews/);
    expect(DETAILS_MASK).not.toMatch(/reviews|editorialSummary/);
  });
});

const g = (over: Record<string, unknown> = {}) => ({
  id: "ChIJ-abcdefghij",
  displayName: { text: "Temple of Literature" },
  location: { latitude: 21.0285123456, longitude: 105.8355123456 },
  formattedAddress: "58 Quốc Tử Giám",
  googleMapsUri: "https://maps.google.com/?cid=1",
  primaryType: "tourist_attraction",
  rating: 4.6,
  userRatingCount: 21874,
  priceLevel: "PRICE_LEVEL_INEXPENSIVE",
  regularOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: 8:00 AM – 5:00 PM"] },
  photos: [
    {
      name: "places/ChIJ-abcdefghij/photos/AaBb-cc_dd1234567890",
      authorAttributions: [{ displayName: "Minh", uri: "https://maps.google.com/x" }],
    },
  ],
  ...over,
});

describe("normalising Google results", () => {
  it("keeps only what a card needs", () => {
    const c = toCard(g())!;
    expect(c).toMatchObject({
      id: "ChIJ-abcdefghij",
      name: "Temple of Literature",
      rating: 4.6,
      ratingCount: 21874,
      priceLevel: 1,
      openNow: true,
      type: "Tourist attraction",
    });
    expect(c.lat).toBe(21.028512);
    expect(c.photo?.authors).toEqual([{ name: "Minh", uri: "https://maps.google.com/x" }]);
  });
  it("keeps Google's short description, trimmed and capped, or null when there is none", () => {
    expect(toCard(g({ editorialSummary: { text: "  A calm lake.  " } }))!.description).toBe("A calm lake.");
    expect(toCard(g({ editorialSummary: { text: "x".repeat(500) } }))!.description).toHaveLength(300);
    expect(toCard(g())!.description).toBeNull();
  });
  it("drops places without a name or location, and duplicates", () => {
    expect(toCard(g({ displayName: undefined }))).toBeNull();
    expect(toCard(g({ location: undefined }))).toBeNull();
    expect(toCards({ places: [g(), g(), g({ id: "ChIJ-other12345" })] })).toHaveLength(2);
    expect(toCards("nonsense")).toEqual([]);
    expect(toCards({})).toEqual([]);
  });
  it("only passes on links that point at Google Maps", () => {
    expect(safeMapsUri("https://www.google.com/maps/place/x")).toContain("google.com");
    expect(safeMapsUri("https://evil.example/maps")).toBeNull();
    expect(safeMapsUri("http://maps.google.com/x")).toBeNull();
    expect(safeMapsUri("javascript:alert(1)")).toBeNull();
    expect(toCard(g({ googleMapsUri: "https://evil.example/x" }))!.mapsUri).toBeNull();
  });
  it("builds the keyless Open in Google Maps link from a place ID", () => {
    const u = mapsLinkFor("ChIJ-abcdefghij");
    expect(u).toBe("https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJ-abcdefghij");
    expect(u).not.toMatch(/key=/i);
  });
  it("never returns a photo URL that carries a key", () => {
    expect(keylessPhotoUri("https://lh3.googleusercontent.com/places/abc=s640")).toContain("https://");
    expect(
      keylessPhotoUri("https://places.googleapis.com/v1/x/media?key=AIzaSyA1234567890123456789012345&maxWidthPx=400"),
    ).toBeNull();
    expect(keylessPhotoUri("https://x.example/p?maxWidthPx=400&key=abc")).toBeNull();
    expect(keylessPhotoUri("https://x.example/AIzaSyA1234567890123456789012345")).toBeNull();
    expect(keylessPhotoUri("http://lh3.googleusercontent.com/x")).toBeNull();
    expect(keylessPhotoUri(undefined)).toBeNull();
  });
  it("labels types ourselves", () => {
    expect(typeLabel("buddhist_temple")).toBe("Buddhist temple");
    expect(typeLabel(undefined)).toBeNull();
  });
});

describe("request validation", () => {
  it("accepts a good search and rejects out-of-range or empty input", () => {
    expect(SearchBody.safeParse({ kind: "sight", city: { name: "Hanoi", lat: 21, lng: 105 } }).success).toBe(true);
    expect(SearchBody.safeParse({ kind: "spa", city: { name: "Hanoi", lat: 21, lng: 105 } }).success).toBe(false);
    expect(SearchBody.safeParse({ kind: "food", city: { name: "", lat: 21, lng: 105 } }).success).toBe(false);
    expect(SearchBody.safeParse({ kind: "food", city: { name: "x", lat: 91, lng: 105 } }).success).toBe(false);
    expect(SearchBody.safeParse({ kind: "food", city: { name: "x".repeat(81), lat: 1, lng: 1 } }).success).toBe(false);
  });
  it("cleans control characters out of the city name before it goes into a query", () => {
    const r = SearchBody.parse({ kind: "food", city: { name: "Ha\u0000 noi\n", lat: 1, lng: 1 } });
    expect(r.city.name).toBe("Ha noi");
  });
  it("accepts only well-formed place IDs and photo names (nothing that could change the URL path)", () => {
    expect(PlaceId.safeParse("ChIJ-abcdefghij").success).toBe(true);
    expect(PlaceId.safeParse("../../etc").success).toBe(false);
    expect(PlaceId.safeParse("ChIJ abc defghij").success).toBe(false);
    expect(DetailsBody.safeParse({ placeId: "a?key=1" }).success).toBe(false);
    expect(PhotoName.safeParse("places/ChIJ-abcdefghij/photos/AaBb-cc_dd1234567890").success).toBe(true);
    expect(PhotoName.safeParse("places/ChIJ-abcdefghij/photos/../../x").success).toBe(false);
    expect(PhotoName.safeParse("https://evil.example/places/x/photos/y").success).toBe(false);
    expect(PhotoBody.parse({ name: "places/ChIJ-abcdefghij/photos/AaBb-cc_dd1234567890" }).maxWidth).toBe(640);
    expect(
      PhotoBody.safeParse({ name: "places/ChIJ-abcdefghij/photos/AaBb-cc_dd1234567890", maxWidth: 5000 }).success,
    ).toBe(false);
    expect(ImageBody.safeParse({ name: "Hoan Kiem Lake", lat: 21, lng: 105 }).success).toBe(true);
  });
});

const file = (over: Partial<CommonsFile> = {}): CommonsFile => ({
  title: "File:Temple of Literature, Hanoi.jpg",
  thumbUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/640px-x.jpg",
  pageUrl: "https://commons.wikimedia.org/wiki/File:Temple_of_Literature,_Hanoi.jpg",
  width: 3000,
  height: 2000,
  mime: "image/jpeg",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  artist: '<a href="//commons.wikimedia.org/wiki/User:A">Hanoi Photo &amp; Co</a>',
  dist: 120,
  ...over,
});

describe("choosing a Wikimedia photo", () => {
  it("matches distinctive words of the name, ignoring accents and generic words", () => {
    expect(tokens("Hoàng's Restaurant - Vietnamese Restaurant")).toEqual(["hoang", "vietnamese"]);
    expect(nameMatch("Bích Động Pagoda", "File:Bich Dong pagoda 2019.jpg")).toBe(1);
    expect(nameMatch("Temple of Literature", "File:Hoan Kiem Lake.jpg")).toBe(0);
  });
  it("accepts only free licences", () => {
    for (const l of ["CC0", "Public domain", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 4.0"])
      expect(isFreeLicense(l)).toBe(true);
    for (const l of ["CC BY-NC 4.0", "CC BY-ND 2.0", "CC BY-NC-SA 3.0", "All rights reserved", ""])
      expect(isFreeLicense(l)).toBe(false);
  });
  it("returns the photo with its author, licence and file page", () => {
    const p = pickPhoto("Temple of Literature", [file()])!;
    expect(p.author).toBe("Hanoi Photo & Co");
    expect(p.license).toBe("CC BY-SA 4.0");
    expect(p.pageUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    expect(p.url).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
  });
  it("returns nothing rather than a photo of the wrong thing", () => {
    expect(pickPhoto("Temple of Literature", [file({ title: "File:Some street food.jpg" })])).toBeNull();
    expect(pickPhoto("Temple of Literature", [])).toBeNull();
  });
  it("skips non-free, tiny, odd-shaped, wrong-type and foreign-host files", () => {
    expect(pickPhoto("Temple of Literature", [file({ license: "CC BY-NC 2.0" })])).toBeNull();
    expect(pickPhoto("Temple of Literature", [file({ width: 300, height: 200 })])).toBeNull();
    expect(pickPhoto("Temple of Literature", [file({ width: 6000, height: 1000 })])).toBeNull();
    expect(pickPhoto("Temple of Literature", [file({ mime: "image/svg+xml" })])).toBeNull();
    expect(pickPhoto("Temple of Literature", [file({ thumbUrl: "https://evil.example/x.jpg" })])).toBeNull();
    expect(pickPhoto("Temple of Literature", [file({ pageUrl: "https://evil.example/p" })])).toBeNull();
  });
  it("prefers the larger, closer match", () => {
    const a = file({ title: "File:Temple of Literature small.jpg", width: 800, height: 600, dist: 500 });
    const b = file({ title: "File:Temple of Literature big.jpg", width: 3200, height: 2000, dist: 50 });
    expect(pickPhoto("Temple of Literature", [a, b])!.title).toBe("Temple of Literature big.jpg");
  });
  it("strips markup out of the author", () => {
    expect(stripHtml('<a href="x">Ngoc &quot;N&quot; Tran</a>')).toBe('Ngoc "N" Tran');
  });
});
