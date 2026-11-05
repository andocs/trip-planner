import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Turns any thrown value or Supabase error into a readable message. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  return fallback;
}

/** Only render links that are http(s), even if bad data got into the database some other way. */
export const safeHref = (v: string | null | undefined) => (v && /^https?:\/\//i.test(v) ? v : undefined);
