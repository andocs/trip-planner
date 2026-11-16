/**
 * Pure helpers for `npm run check:secrets`. A Google API key looks like "AIza" followed by 35 URL-safe characters.
 * Nothing in here prints a key: findings carry a masked excerpt only.
 */

export const KEY_RE = /AIza[0-9A-Za-z_-]{35}/g;

/** The one public Google key we allow (a browser key, restricted by HTTP referrer and to the Maps JavaScript API). */
export const BROWSER_KEY_NAME = "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY";

/** NEXT_PUBLIC_ names that are fine: they are public by design. */
export const PUBLIC_OK = new Set([
  BROWSER_KEY_NAME,
  "NEXT_PUBLIC_GOOGLE_MAP_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

/** A NEXT_PUBLIC_ name that suggests a secret. */
const SECRETISH = /SERVER|SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN|GOOGLE/i;

export type Finding = { where: string; what: string };

export const mask = (s: string) => `${s.slice(0, 4)}…(${s.length} chars)`;

/** NEXT_PUBLIC_ variables get baked into the browser bundle, so no secret may hide behind that prefix. */
export function checkPublicEnv(env: Record<string, string | undefined>): Finding[] {
  const out: Finding[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (!PUBLIC_OK.has(name) && SECRETISH.test(name))
      out.push({
        where: `env ${name}`,
        what: "a NEXT_PUBLIC_ name that looks like a secret (it would be sent to every browser)",
      });
    if (value && name !== BROWSER_KEY_NAME && new RegExp(KEY_RE.source).test(value))
      out.push({ where: `env ${name}`, what: "its value looks like a Google API key" });
  }
  return out;
}

/** Looks for key-shaped strings (and the exact server key, if known) in a piece of text. Allowed values are skipped. */
export function scanText(
  text: string,
  where: string,
  opts: { allow?: Set<string>; serverKey?: string } = {},
): Finding[] {
  const out: Finding[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (opts.serverKey && opts.serverKey.length >= 20 && line.includes(opts.serverKey)) {
      out.push({ where: `${where}:${i + 1}`, what: "contains the value of GOOGLE_MAPS_SERVER_KEY" });
      continue;
    }
    for (const m of line.matchAll(KEY_RE)) {
      if (opts.allow?.has(m[0])) continue;
      out.push({ where: `${where}:${i + 1}`, what: `a Google API key (${mask(m[0])})` });
    }
  }
  return out;
}

export const ROTATE_ADVICE = [
  "STOP: a Google API key may be exposed.",
  "Rotate it now: Google Cloud Console → APIs & Services → Credentials → open the key → delete it and create a new one",
  "(or use 'Regenerate'), keep the same restrictions, then update .env.local and the Vercel variable yourself.",
  "Do not paste the key anywhere, including into this tool.",
].join("\n");
