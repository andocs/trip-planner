import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/** OAuth return: swap the one-time code for a session cookie, then go where the user was heading. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const raw = url.searchParams.get("next") ?? "/";
  // Only same-site paths: never let a crafted link bounce someone to another origin.
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=1", url.origin));
}
