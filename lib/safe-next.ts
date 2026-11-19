/**
 * Only same-site paths: never let a crafted link bounce someone to another origin.
 * Browsers treat "\" like "/", so "/\evil.com" must be refused too.
 */
export function safeNext(raw: string, origin: string): string {
  if (!raw.startsWith("/") || raw.includes("\\")) return "/";
  try {
    const u = new URL(raw, origin);
    return u.origin === origin ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
