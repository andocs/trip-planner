import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** What browsers say when a request never reached the server (Chrome, Firefox, Safari). */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;
export const OFFLINE_MESSAGE = "You're offline, so this couldn't be saved. Try again when you have a connection.";

/** Turns any thrown value or Supabase error into a readable message. A dropped connection gets one plain sentence. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  const raw =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : null;
  if (raw === null) return fallback;
  return NETWORK_FAILURE.test(raw) ? OFFLINE_MESSAGE : raw;
}

/** Only render links that are http(s), even if bad data got into the database some other way. */
export const safeHref = (v: string | null | undefined) => (v && /^https?:\/\//i.test(v) ? v : undefined);
