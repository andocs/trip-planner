import { isIP } from "node:net";
import { isPublicIp } from "./ip";

/**
 * Finding the picture of a pasted link, safely. This runs on the server for the owner only, so it is a request the
 * server makes on someone's behalf: the classic way to reach private services (server-side request forgery). Rules:
 *  - https only, no user:password, port 443 only, and never a bare IP address or a local-looking name;
 *  - EVERY address the name resolves to must be public (see isPublicIp), and the connection is pinned to the
 *    address that was checked, so the name cannot change its answer between the check and the connection;
 *  - redirects are followed by hand (at most 3) and each hop goes through the same checks;
 *  - strict limits: 6 s overall, 512 KB of HTML, and the picture itself must be an image under 10 MB;
 *  - no cookies or credentials are ever sent, and the response body is never passed on, only the picture's address.
 * The network is injected (Deps) so the rules are unit-tested without one.
 */

export type LinkErrorCode = "not_https" | "blocked_address" | "no_picture" | "too_large" | "unreachable";
export class LinkError extends Error {
  constructor(readonly code: LinkErrorCode) {
    super(code);
    this.name = "LinkError";
  }
}

export type Reply = {
  status: number;
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
  destroy: () => void;
};
export type Deps = {
  lookup: (host: string) => Promise<{ address: string; family: number }[]>;
  /** One GET to an already-checked address (the connection is pinned to `ip`). */
  request: (a: {
    url: URL;
    ip: string;
    family: number;
    headers: Record<string, string>;
    timeoutMs: number;
  }) => Promise<Reply>;
  now: () => number;
};

export const LIMITS = { totalMs: 6000, htmlBytes: 512 * 1024, imageBytes: 10 * 1024 * 1024, redirects: 3 } as const;
const IMAGE_TYPES = /^image\/(jpeg|png|webp)\b/i;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TripPlannerBot/0.1; link preview for a private trip planner)",
  Accept: "text/html,application/xhtml+xml,image/jpeg,image/png,image/webp;q=0.8,*/*;q=0.1",
  "Accept-Encoding": "identity", // never ask for compression: no decompression bombs
  "Accept-Language": "en",
};

/** Parse and vet a URL before any lookup. */
export function vetUrl(raw: string, base?: string): URL {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    throw new LinkError("not_https");
  }
  if (u.protocol !== "https:") throw new LinkError("not_https");
  if (u.username || u.password) throw new LinkError("blocked_address");
  if (u.port && u.port !== "443") throw new LinkError("blocked_address");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) throw new LinkError("blocked_address"); // a bare IP address is never an ordinary photo site
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host))
    throw new LinkError("blocked_address");
  if (raw.length > 2000) throw new LinkError("not_https");
  return u;
}

async function resolvePublic(host: string, deps: Deps) {
  let list: { address: string; family: number }[];
  try {
    list = await deps.lookup(host);
  } catch {
    throw new LinkError("unreachable");
  }
  if (list.length === 0) throw new LinkError("unreachable");
  // every answer must be public: a name that also points inside is refused outright
  if (!list.every((a) => isPublicIp(a.address))) throw new LinkError("blocked_address");
  return list[0];
}

async function readUpTo(body: AsyncIterable<Uint8Array>, max: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let n = 0;
  for await (const c of body) {
    n += c.length;
    if (n > max) {
      chunks.push(c.subarray(0, c.length - (n - max)));
      break; // enough: the picture's tag is near the top
    }
    chunks.push(c);
  }
  const out = new Uint8Array(Math.min(n, max));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** GET with manual, re-checked redirects. Returns the final reply and the final URL. */
async function get(start: URL, deps: Deps, deadline: number): Promise<{ reply: Reply; url: URL }> {
  let url = start;
  for (let hop = 0; hop <= LIMITS.redirects; hop++) {
    const left = deadline - deps.now();
    if (left <= 0) throw new LinkError("unreachable");
    const addr = await resolvePublic(url.hostname.replace(/^\[|\]$/g, ""), deps);
    let reply: Reply;
    try {
      reply = await deps.request({ url, ip: addr.address, family: addr.family, headers: HEADERS, timeoutMs: left });
    } catch {
      throw new LinkError("unreachable");
    }
    if ([301, 302, 303, 307, 308].includes(reply.status)) {
      reply.destroy();
      const loc = reply.headers["location"];
      if (!loc || hop === LIMITS.redirects) throw new LinkError("unreachable");
      url = vetUrl(loc, url.toString());
      continue;
    }
    if (reply.status < 200 || reply.status >= 300) {
      reply.destroy();
      throw new LinkError(reply.status === 404 || reply.status === 410 ? "no_picture" : "unreachable");
    }
    return { reply, url };
  }
  throw new LinkError("unreachable");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** The picture address and site name a page advertises: og:image (then twitter:image, then link rel=image_src). */
export function findPicture(html: string): { image: string | null; site: string | null } {
  const metas: Record<string, string> = {};
  let image: string | null = null;
  for (const tag of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const m of tag[0].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? "");
    if (tag[1].toLowerCase() === "link") {
      if ((attrs.rel ?? "").toLowerCase() === "image_src" && attrs.href && !image) image = attrs.href;
      continue;
    }
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !(key in metas)) metas[key] = attrs.content;
  }
  return {
    image:
      metas["og:image:secure_url"] ??
      metas["og:image"] ??
      metas["og:image:url"] ??
      metas["twitter:image"] ??
      metas["twitter:image:src"] ??
      image,
    site: metas["og:site_name"]?.slice(0, 80) ?? null,
  };
}

export type Found = { imageUrl: string; pageUrl: string | null; site: string };

/** A pasted page or picture link -> the picture's own https address. */
export async function resolvePicture(input: string, deps: Deps): Promise<Found> {
  const deadline = deps.now() + LIMITS.totalMs;
  const first = vetUrl(input.trim());
  const { reply, url } = await get(first, deps, deadline);
  const type = reply.headers["content-type"] ?? "";

  // The link is itself a picture.
  if (IMAGE_TYPES.test(type)) {
    reply.destroy();
    checkSize(reply.headers["content-length"]);
    return { imageUrl: url.toString(), pageUrl: null, site: url.hostname.replace(/^www\./, "") };
  }
  if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(type)) {
    reply.destroy();
    throw new LinkError("no_picture");
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(await readUpTo(reply.body, LIMITS.htmlBytes));
  reply.destroy();
  const found = findPicture(html);
  if (!found.image) throw new LinkError("no_picture");
  const imageUrl = vetUrl(found.image, url.toString());

  // The picture itself: must be a real image of a sane size, on a public host.
  const img = await get(imageUrl, deps, deadline);
  img.reply.destroy();
  if (!IMAGE_TYPES.test(img.reply.headers["content-type"] ?? "")) throw new LinkError("no_picture");
  checkSize(img.reply.headers["content-length"]);
  return {
    imageUrl: img.url.toString(),
    pageUrl: url.toString(),
    site: found.site ?? url.hostname.replace(/^www\./, ""),
  };
}

function checkSize(len: string | undefined) {
  if (len && Number(len) > LIMITS.imageBytes) throw new LinkError("too_large");
}
