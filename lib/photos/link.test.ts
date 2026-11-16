import { describe, expect, it } from "vitest";
import { isPublicIp } from "./ip";
import { LIMITS, LinkError, findPicture, resolvePicture, vetUrl, type Deps, type Reply } from "./link";

describe("which addresses may be connected to", () => {
  it("allows ordinary public addresses", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "151.101.1.69",
      "2606:4700:4700::1111",
      "2a00:1450:4001:81b::200e",
    ])
      expect(isPublicIp(ip), ip).toBe(true);
  });
  it("refuses loopback, private, link-local, metadata, carrier-grade NAT and reserved IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "127.255.255.254",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.20",
      "169.254.169.254",
      "100.64.0.1",
      "100.127.255.255",
      "192.0.0.1",
      "192.0.2.5",
      "198.18.0.1",
      "198.51.100.7",
      "203.0.113.9",
      "224.0.0.1",
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
    ])
      expect(isPublicIp(ip), ip).toBe(false);
  });
  it("does not mistake near-misses for private ranges", () => {
    for (const ip of [
      "172.15.0.1",
      "172.32.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "169.253.1.1",
      "192.169.0.1",
      "11.0.0.1",
    ])
      expect(isPublicIp(ip), ip).toBe(true);
  });
  it("refuses loopback, unique-local, link-local, multicast, documentation and unspecified IPv6", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456:789a::1",
      "fe80::1",
      "fe80::1%eth0",
      "febf::1",
      "ff02::1",
      "2001:db8::1",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
      "100::1",
      "5f00::1",
      "1::1",
    ])
      expect(isPublicIp(ip), ip).toBe(false);
  });
  it("looks inside IPv4-in-IPv6 forms and judges the IPv4 part", () => {
    for (const ip of [
      "::ffff:127.0.0.1",
      "::ffff:10.1.2.3",
      "::ffff:169.254.169.254",
      "::ffff:7f00:1",
      "64:ff9b::7f00:1",
      "64:ff9b::a9fe:a9fe",
      "2002:7f00:1::1",
      "2002:c0a8:101::1",
      "::127.0.0.1",
    ])
      expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ["::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"]) expect(isPublicIp(ip), ip).toBe(true);
  });
  it("refuses anything that is not an address", () => {
    for (const ip of [
      "",
      "localhost",
      "example.com",
      "999.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "0x7f.0.0.1",
      "2130706433",
      "::g",
      "1:2:3:4:5:6:7:8:9",
      "[::1]",
    ])
      expect(isPublicIp(ip), ip).toBe(false);
  });
});

describe("vetting a link before any lookup", () => {
  const code = (raw: string) => {
    try {
      vetUrl(raw);
      return "ok";
    } catch (e) {
      return (e as LinkError).code;
    }
  };
  it("accepts a normal https page", () => {
    expect(code("https://www.booking.com/hotel/vn/x.html?aid=1")).toBe("ok");
    expect(code("https://example.com:443/a.jpg")).toBe("ok");
  });
  it("needs https", () => {
    for (const u of [
      "http://example.com/a",
      "ftp://example.com/a",
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "//example.com/a",
      "not a url",
      "",
    ])
      expect(code(u), u).toBe("not_https");
  });
  it("refuses credentials, other ports, bare IPs and local-looking names", () => {
    for (const u of [
      "https://user:pw@example.com/",
      "https://example.com:8443/",
      "https://example.com:22/",
      "https://127.0.0.1/",
      "https://10.0.0.1/a",
      "https://[::1]/",
      "https://169.254.169.254/latest/meta-data/",
      "https://8.8.8.8/",
      "https://2130706433/",
      "https://localhost/",
      "https://intranet/",
      "https://printer.local/",
      "https://svc.internal/",
      "https://a.localhost/",
      "https://router.lan/",
    ])
      expect(code(u), u).toBe("blocked_address");
  });
});

/** A tiny fake internet: names -> addresses, URLs -> replies. */
function net(opts: {
  dns: Record<string, string[]>;
  pages: Record<string, { status?: number; type?: string; len?: string; location?: string; body?: string }>;
}) {
  const requests: { url: string; ip: string; headers: Record<string, string> }[] = [];
  let destroyed = 0;
  let clock = 0;
  const deps: Deps = {
    lookup: async (host) => {
      const a = opts.dns[host];
      if (!a) throw new Error("ENOTFOUND");
      return a.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    },
    request: async ({ url, ip, headers }) => {
      requests.push({ url: url.toString(), ip, headers });
      clock += 100;
      const p = opts.pages[url.toString()];
      if (!p) return reply(404, {}, "");
      const h: Record<string, string> = {};
      if (p.type) h["content-type"] = p.type;
      if (p.len) h["content-length"] = p.len;
      if (p.location) h["location"] = p.location;
      return reply(p.status ?? 200, h, p.body ?? "");
    },
    now: () => clock,
  };
  function reply(status: number, headers: Record<string, string>, body: string): Reply {
    const bytes = new TextEncoder().encode(body);
    return {
      status,
      headers,
      body: (async function* () {
        for (let i = 0; i < bytes.length; i += 1000) yield bytes.subarray(i, i + 1000);
      })(),
      destroy: () => void destroyed++,
    };
  }
  return { deps, requests, destroyed: () => destroyed, advance: (ms: number) => (clock += ms) };
}

const PUBLIC = { "example.com": ["93.184.216.34"], "cdn.example.com": ["93.184.216.35"] };
const page = (head: string) => ({
  type: "text/html; charset=utf-8",
  body: `<html><head>${head}</head><body>hi</body></html>`,
});
const img = { type: "image/jpeg", len: "120000" };
const fail = async (p: Promise<unknown>) => {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof LinkError ? e.code : `unexpected: ${String(e)}`;
  }
};

describe("reading a pasted link", () => {
  it("finds og:image, resolves a relative address and checks the picture itself", async () => {
    const n = net({
      dns: PUBLIC,
      pages: {
        "https://example.com/hotel": page(
          '<meta property="og:image" content="/img/room.jpg"><meta property="og:site_name" content="Example Hotels">',
        ),
        "https://example.com/img/room.jpg": img,
      },
    });
    const found = await resolvePicture("https://example.com/hotel", n.deps);
    expect(found).toEqual({
      imageUrl: "https://example.com/img/room.jpg",
      pageUrl: "https://example.com/hotel",
      site: "Example Hotels",
    });
  });

  it("accepts a link that is itself a picture without reading its body", async () => {
    const n = net({ dns: PUBLIC, pages: { "https://cdn.example.com/a.jpg": img } });
    expect(await resolvePicture("https://cdn.example.com/a.jpg", n.deps)).toMatchObject({
      imageUrl: "https://cdn.example.com/a.jpg",
      pageUrl: null,
      site: "cdn.example.com",
    });
    expect(n.destroyed()).toBe(1);
  });

  it("pins the connection to the checked address and sends no cookies, no auth and no compression", async () => {
    const n = net({
      dns: PUBLIC,
      pages: {
        "https://example.com/p": page('<meta property="og:image" content="https://cdn.example.com/a.jpg">'),
        "https://cdn.example.com/a.jpg": img,
      },
    });
    await resolvePicture("https://example.com/p", n.deps);
    expect(n.requests.map((r) => r.ip)).toEqual(["93.184.216.34", "93.184.216.35"]);
    for (const r of n.requests) {
      expect(Object.keys(r.headers).map((k) => k.toLowerCase())).not.toEqual(expect.arrayContaining(["cookie"]));
      expect(Object.keys(r.headers).map((k) => k.toLowerCase())).not.toContain("authorization");
      expect(r.headers["Accept-Encoding"]).toBe("identity");
    }
  });

  it("refuses a name that resolves to a private address, and one that mixes public and private answers", async () => {
    let n = net({ dns: { "evil.example": ["10.0.0.7"] }, pages: { "https://evil.example/": page("") } });
    expect(await fail(resolvePicture("https://evil.example/", n.deps))).toBe("blocked_address");
    expect(n.requests).toHaveLength(0);
    n = net({
      dns: { "evil.example": ["93.184.216.34", "169.254.169.254"] },
      pages: { "https://evil.example/": page("") },
    });
    expect(await fail(resolvePicture("https://evil.example/", n.deps))).toBe("blocked_address");
    n = net({ dns: { "evil.example": ["::1"] }, pages: {} });
    expect(await fail(resolvePicture("https://evil.example/", n.deps))).toBe("blocked_address");
    n = net({ dns: { "evil.example": ["::ffff:127.0.0.1"] }, pages: {} });
    expect(await fail(resolvePicture("https://evil.example/", n.deps))).toBe("blocked_address");
    expect(n.requests).toHaveLength(0);
  });

  it("re-checks every redirect: a public page that redirects inside is refused", async () => {
    const n = net({
      dns: { ...PUBLIC, "internal.example": ["192.168.0.9"] },
      pages: {
        "https://example.com/go": { status: 302, location: "https://internal.example/admin" },
        "https://internal.example/admin": page(""),
      },
    });
    expect(await fail(resolvePicture("https://example.com/go", n.deps))).toBe("blocked_address");
    expect(n.requests.map((r) => r.url)).toEqual(["https://example.com/go"]);
  });

  it("refuses redirects to http, to a bare IP, to another port, and to a local name", async () => {
    for (const to of [
      "http://example.com/x",
      "https://127.0.0.1/x",
      "https://example.com:8080/x",
      "https://localhost/x",
      "ftp://example.com/x",
    ]) {
      const n = net({ dns: PUBLIC, pages: { "https://example.com/go": { status: 301, location: to } } });
      expect(["not_https", "blocked_address"], to).toContain(
        await fail(resolvePicture("https://example.com/go", n.deps)),
      );
    }
  });

  it("follows a few redirects and stops after three", async () => {
    const hops = (k: number) =>
      Object.fromEntries(
        Array.from({ length: k }, (_, i) => [
          `https://example.com/${i}`,
          { status: 302, location: `https://example.com/${i + 1}` },
        ]),
      );
    let n = net({ dns: PUBLIC, pages: { ...hops(3), "https://example.com/3": img } });
    expect((await resolvePicture("https://example.com/0", n.deps)).imageUrl).toBe("https://example.com/3");
    n = net({ dns: PUBLIC, pages: { ...hops(4), "https://example.com/4": img } });
    expect(await fail(resolvePicture("https://example.com/0", n.deps))).toBe("unreachable");
  });

  it("reports a missing picture, a non-image, an oversized picture and a dead page", async () => {
    let n = net({ dns: PUBLIC, pages: { "https://example.com/p": page("<title>no picture</title>") } });
    expect(await fail(resolvePicture("https://example.com/p", n.deps))).toBe("no_picture");
    n = net({ dns: PUBLIC, pages: { "https://example.com/p": { type: "application/pdf", body: "%PDF" } } });
    expect(await fail(resolvePicture("https://example.com/p", n.deps))).toBe("no_picture");
    n = net({
      dns: PUBLIC,
      pages: {
        "https://example.com/p": page('<meta property="og:image" content="https://cdn.example.com/a.jpg">'),
        "https://cdn.example.com/a.jpg": { type: "text/html", body: "<script>" },
      },
    });
    expect(await fail(resolvePicture("https://example.com/p", n.deps))).toBe("no_picture");
    n = net({
      dns: PUBLIC,
      pages: {
        "https://example.com/p": page('<meta property="og:image" content="https://cdn.example.com/a.jpg">'),
        "https://cdn.example.com/a.jpg": { type: "image/jpeg", len: String(LIMITS.imageBytes + 1) },
      },
    });
    expect(await fail(resolvePicture("https://example.com/p", n.deps))).toBe("too_large");
    n = net({ dns: PUBLIC, pages: { "https://example.com/p": { status: 500, type: "text/html" } } });
    expect(await fail(resolvePicture("https://example.com/p", n.deps))).toBe("unreachable");
    n = net({ dns: PUBLIC, pages: {} });
    expect(await fail(resolvePicture("https://example.com/gone", n.deps))).toBe("no_picture");
    n = net({ dns: {}, pages: {} });
    expect(await fail(resolvePicture("https://nowhere.example/", n.deps))).toBe("unreachable");
  });

  it("refuses an og:image that points somewhere it must not (private host, http, svg, script)", async () => {
    for (const bad of [
      "http://cdn.example.com/a.jpg",
      "https://127.0.0.1/a.jpg",
      "javascript:alert(1)",
      "https://localhost/a.jpg",
      "//evil.example/a.jpg",
    ]) {
      const n = net({
        dns: { ...PUBLIC, "evil.example": ["10.1.1.1"] },
        pages: { "https://example.com/p": page(`<meta property="og:image" content="${bad}">`) },
      });
      expect(["not_https", "blocked_address"], bad).toContain(
        await fail(resolvePicture("https://example.com/p", n.deps)),
      );
    }
    const svg = net({
      dns: PUBLIC,
      pages: {
        "https://example.com/p": page('<meta property="og:image" content="https://cdn.example.com/a.svg">'),
        "https://cdn.example.com/a.svg": { type: "image/svg+xml" },
      },
    });
    expect(await fail(resolvePicture("https://example.com/p", svg.deps))).toBe("no_picture");
  });

  it("stops when the time budget is spent", async () => {
    const n = net({
      dns: PUBLIC,
      pages: {
        "https://example.com/p": page('<meta property="og:image" content="https://cdn.example.com/a.jpg">'),
        "https://cdn.example.com/a.jpg": img,
      },
    });
    n.advance(LIMITS.totalMs + 1);
    // the first request is already past the deadline set from the clock at the start, so make the start earlier
    const slow: Deps = { ...n.deps, request: async (a) => (n.advance(LIMITS.totalMs), n.deps.request(a)) };
    expect(await fail(resolvePicture("https://example.com/p", slow))).toBe("unreachable");
  });

  it("only reads the first 512 KB of a page", async () => {
    let read = 0;
    const deps: Deps = {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async ({ url }) => {
        if (url.pathname === "/a.jpg")
          return {
            status: 200,
            headers: { "content-type": "image/png" },
            body: (async function* () {})(),
            destroy() {},
          };
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          body: (async function* () {
            yield new TextEncoder().encode('<meta property="og:image" content="/a.jpg">');
            for (let i = 0; i < 100; i++) {
              read += 64 * 1024;
              yield new Uint8Array(64 * 1024);
            }
          })(),
          destroy() {},
        };
      },
      now: () => 0,
    };
    expect((await resolvePicture("https://example.com/p", deps)).imageUrl).toBe("https://example.com/a.jpg");
    expect(read).toBeLessThanOrEqual(LIMITS.htmlBytes + 64 * 1024);
  });
});

describe("reading og:image out of a page", () => {
  it("handles attribute order, quotes, entities, twitter:image and image_src", () => {
    expect(findPicture('<meta content="https://a.example/x.jpg?a=1&amp;b=2" property="og:image">').image).toBe(
      "https://a.example/x.jpg?a=1&b=2",
    );
    expect(findPicture("<meta property='og:image' content='https://a.example/y.jpg'>").image).toBe(
      "https://a.example/y.jpg",
    );
    expect(findPicture('<meta name="twitter:image" content="https://a.example/t.jpg">').image).toBe(
      "https://a.example/t.jpg",
    );
    expect(findPicture('<link rel="image_src" href="https://a.example/l.jpg">').image).toBe("https://a.example/l.jpg");
    expect(
      findPicture(
        '<meta property="og:image:secure_url" content="https://a.example/s.jpg"><meta property="og:image" content="http://a.example/p.jpg">',
      ).image,
    ).toBe("https://a.example/s.jpg");
    expect(findPicture("<p>nothing</p>").image).toBeNull();
  });
});
