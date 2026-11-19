import "server-only";

import { z } from "zod";
import { requireUserId } from "@/lib/supabase/require-user";
import { isSameOrigin } from "@/lib/same-origin";
import { LIMITS, LinkError, resolvePicture, type Deps, type LinkErrorCode } from "./link";
import { netDeps } from "./net";

export const LinkBody = z.object({ url: z.string().trim().min(8).max(2000) });

const MESSAGES: Record<LinkErrorCode | "forbidden" | "bad_request" | "rate", string> = {
  not_https: "The link must start with https://",
  blocked_address: "That address can't be opened. Private and internal addresses are blocked.",
  no_picture: "No picture found on that page.",
  too_large: "That picture is too large (over 10 MB).",
  unreachable: "Couldn't open that page in time.",
  forbidden: "Only the trip owner can add photos.",
  bad_request: "That doesn't look like a link.",
  rate: "That was a lot of links in a minute. Wait a moment and try again.",
};
const STATUS = { forbidden: 403, bad_request: 400, rate: 429 } as const;

const fail = (code: keyof typeof MESSAGES) =>
  Response.json(
    { error: code, message: MESSAGES[code] },
    { status: STATUS[code as keyof typeof STATUS] ?? 422, headers: { "Cache-Control": "no-store" } },
  );

/** In-memory limiter: per signed-in owner, per server instance. */
const recent = new Map<string, number[]>();
const allow = (id: string, perMinute: number) => {
  const now = Date.now();
  if (recent.size > 200) for (const [k, v] of recent) if (v.every((t) => now - t >= 60_000)) recent.delete(k); // never grows without bound
  const list = (recent.get(id) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) return false;
  recent.set(id, [...list, now]);
  return true;
};

/**
 * Owner only. Fetches a pasted page (or picture) link and returns the picture's own https address. Only that
 * address, the page address and a site name leave the server: never the fetched content, headers or any error text.
 */
export async function handleLink(request: Request, deps: Deps = netDeps): Promise<Response> {
  if (!isSameOrigin(request)) return fail("forbidden");
  const userId = await requireUserId();
  if (!userId) return fail("forbidden");
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail("bad_request");
  }
  const parsed = LinkBody.safeParse(json);
  if (!parsed.success) return fail("bad_request");
  if (!allow(userId, 20)) return fail("rate");
  try {
    // resolvePicture checks its own clock between steps; this is the hard stop for a server that trickles bytes.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hardStop = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LinkError("unreachable")), LIMITS.totalMs + 1500);
    });
    const found = await Promise.race([resolvePicture(parsed.data.url, deps), hardStop]).finally(() => clearTimeout(timer));
    return Response.json({ found }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof LinkError ? e.code : "unreachable");
  }
}
