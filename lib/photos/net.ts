import "server-only";

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { Deps } from "./link";

/**
 * The real network for link.ts. The TCP connection goes to the address that was already checked (`ip`), not to
 * whatever the name resolves to now, while TLS still verifies the certificate for the real host name (servername).
 * No agent, so no connection is reused across users, and no cookies or credentials are sent.
 */
export const netDeps: Deps = {
  lookup: async (host) =>
    (await lookup(host, { all: true, verbatim: true })).map((a) => ({ address: a.address, family: a.family })),
  request: ({ url, ip, family, headers, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: url.hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: { ...headers, Host: url.host },
          servername: url.hostname,
          timeout: timeoutMs,
          agent: false,
          // Newer Node asks for every address at once (all: true); either way the answer is the one pinned address.
          lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) =>
            opts?.all ? cb(null, [{ address: ip, family }]) : cb(null, ip, family)) as never,
        },
        (res) => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers))
            if (v !== undefined) h[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
          resolve({ status: res.statusCode ?? 0, headers: h, body: res, destroy: () => res.destroy() });
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    }),
  now: () => Date.now(),
};
