import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deps } from "./link";

vi.mock("server-only", () => ({}));
const requireUserId = vi.fn();
vi.mock("@/lib/supabase/require-user", () => ({ requireUserId: () => requireUserId() }));
vi.mock("./net", () => ({ netDeps: {} }));

const post = (body: unknown) =>
  new Request("http://localhost/api/photos/link", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const deps = (over: Partial<Deps> = {}): Deps => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  request: async () => ({
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": "1000" },
    body: (async function* () {})(),
    destroy() {},
  }),
  now: () => 0,
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  requireUserId.mockResolvedValue("owner-1");
});

describe("POST /api/photos/link", () => {
  it("is for the signed-in owner only", async () => {
    requireUserId.mockResolvedValue(null);
    const { handleLink } = await import("./route");
    const res = await handleLink(post({ url: "https://example.com/a.jpg" }), deps());
    expect(res.status).toBe(403);
  });

  it("validates the body", async () => {
    const { handleLink } = await import("./route");
    for (const body of ["nope{", {}, { url: 5 }, { url: "x" }, { url: "https://example.com/" + "a".repeat(2100) }])
      expect((await handleLink(post(body), deps())).status).toBe(400);
  });

  it("returns only the picture address, the page address and a site name", async () => {
    const { handleLink } = await import("./route");
    const res = await handleLink(post({ url: "https://example.com/a.jpg" }), deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      found: { imageUrl: "https://example.com/a.jpg", pageUrl: null, site: "example.com" },
    });
  });

  it("answers each refusal with a fixed message and never echoes the address, the response or an internal error", async () => {
    const { handleLink } = await import("./route");
    const cases: [string, Partial<Deps>, number, string][] = [
      ["http://example.com/a", {}, 422, "not_https"],
      ["https://127.0.0.1/secret", {}, 422, "blocked_address"],
      [
        "https://internal.example/x",
        { lookup: async () => [{ address: "10.0.0.8", family: 4 }] },
        422,
        "blocked_address",
      ],
      [
        "https://example.com/p",
        {
          request: async () => {
            throw new Error("connect ECONNREFUSED 10.1.2.3:443 secret-host.internal");
          },
        },
        422,
        "unreachable",
      ],
    ];
    for (const [url, over, status, code] of cases) {
      const res = await handleLink(post({ url }), deps(over));
      const text = await res.text();
      expect(res.status).toBe(status);
      expect(JSON.parse(text).error).toBe(code);
      expect(text).not.toMatch(/10\.0\.0\.8|10\.1\.2\.3|ECONNREFUSED|secret-host|127\.0\.0\.1|internal\.example/);
    }
  });

  it("limits how many links one owner can try in a minute", async () => {
    const { handleLink } = await import("./route");
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await handleLink(post({ url: "https://example.com/a.jpg" }), deps())).status;
    expect(last).toBe(429);
  });
});
