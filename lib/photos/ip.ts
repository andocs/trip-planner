import { isIP } from "node:net";

/**
 * Is this address one we may connect to on behalf of a user-supplied link? Only public, globally routable addresses
 * pass. Loopback, private, link-local (including the cloud metadata address 169.254.169.254), carrier-grade NAT,
 * documentation, multicast and reserved ranges are refused, for IPv4 and IPv6 (including IPv4 hidden inside an IPv6
 * address). Anything that does not parse is refused too.
 */

function v4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const n = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return n.every((x) => x >= 0 && x <= 255) ? n : null;
}

function isPublicV4(o: number[]): boolean {
  const [a, b, c] = o;
  if (a === 0) return false; // "this" network
  if (a === 10) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false; // documentation
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay (deprecated)
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Eight 16-bit groups of an IPv6 address, or null if it does not parse. */
function groups6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // an embedded dotted IPv4 in the last 32 bits
  const dot = s.lastIndexOf(".");
  if (dot >= 0) {
    const colon = s.lastIndexOf(":");
    const o = v4(s.slice(colon + 1));
    if (!o) return null;
    s = `${s.slice(0, colon + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (x: string) => (x === "" ? [] : x.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  if (all.length !== 8) return null;
  const out = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.every((x) => Number.isInteger(x)) ? out : null;
}

function isPublicV6(g: number[]): boolean {
  const first5Zero = g.slice(0, 5).every((x) => x === 0);
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and the deprecated IPv4-compatible (::a.b.c.d): judge the embedded IPv4
  if (first5Zero && (g[5] === 0xffff || g[5] === 0)) return isPublicV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  // NAT64 (64:ff9b::/96): judge the embedded IPv4
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPublicV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  if (g[0] === 0x2002) return isPublicV4([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]); // 6to4: embedded IPv4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard-only 100::/64
  if ((g[0] & 0xe000) !== 0x2000) return false; // only global unicast 2000::/3 is allowed
  return true;
}

export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const o = v4(ip);
    return !!o && isPublicV4(o);
  }
  if (kind === 6) {
    const g = groups6(ip);
    return !!g && isPublicV6(g);
  }
  return false;
}
