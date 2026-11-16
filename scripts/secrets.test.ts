import { describe, expect, it } from "vitest";
import { BROWSER_KEY_NAME, checkPublicEnv, mask, scanText } from "./secrets-lib";

// Built at run time so this file itself never contains a key-shaped string.
const fakeKey = (tail = "x") => "AI" + "za" + "Sy" + tail.repeat(33).slice(0, 33);

describe("check:secrets rules", () => {
  it("allows the referrer-restricted browser key and the map id, and the Supabase public values", () => {
    expect(
      checkPublicEnv({
        [BROWSER_KEY_NAME]: fakeKey("a"),
        NEXT_PUBLIC_GOOGLE_MAP_ID: "abc123",
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      }),
    ).toEqual([]);
  });
  it("fails on any other NEXT_PUBLIC_ name that looks like a secret", () => {
    for (const name of [
      "NEXT_PUBLIC_GOOGLE_MAPS_SERVER_KEY",
      "NEXT_PUBLIC_GOOGLE_PLACES_KEY",
      "NEXT_PUBLIC_SERVICE_ROLE",
      "NEXT_PUBLIC_API_SECRET",
    ])
      expect(checkPublicEnv({ [name]: "x" }).length, name).toBeGreaterThan(0);
  });
  it("fails on a Google-key-shaped value hiding behind an innocent NEXT_PUBLIC_ name", () => {
    expect(checkPublicEnv({ NEXT_PUBLIC_MAP_THING: fakeKey("b") })).toHaveLength(1);
  });
  it("ignores variables without the NEXT_PUBLIC_ prefix (server-only values are meant to be private)", () => {
    expect(checkPublicEnv({ GOOGLE_MAPS_SERVER_KEY: fakeKey("c") })).toEqual([]);
  });
});

describe("scanning text", () => {
  it("finds a key with its line number and masks it", () => {
    const k = fakeKey("d");
    const f = scanText(`line one\nconst k = "${k}";\n`, "bundle.js");
    expect(f).toHaveLength(1);
    expect(f[0].where).toBe("bundle.js:2");
    expect(f[0].what).not.toContain(k);
    expect(f[0].what).toContain(mask(k));
  });
  it("skips an allowed value (the browser key inlined in the bundle) but not a different one", () => {
    const ok = fakeKey("e");
    const other = fakeKey("f");
    expect(scanText(`a="${ok}"`, "b.js", { allow: new Set([ok]) })).toEqual([]);
    expect(scanText(`a="${other}"`, "b.js", { allow: new Set([ok]) })).toHaveLength(1);
  });
  it("finds the exact server key value even if it is not key-shaped", () => {
    const f = scanText('x="my-server-secret-value-123456"', "tree", { serverKey: "my-server-secret-value-123456" });
    expect(f).toHaveLength(1);
    expect(f[0].what).toContain("GOOGLE_MAPS_SERVER_KEY");
  });
  it("is quiet on ordinary text and on near-misses", () => {
    expect(scanText("AIza is the start of a key; AIzaShort", "f")).toEqual([]);
  });
});
