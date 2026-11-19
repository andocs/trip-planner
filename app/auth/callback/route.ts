import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseServer } from "@/lib/supabase/server";

/** OAuth return: swap the one-time code for a session cookie, then go where the user was heading. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const raw = url.searchParams.get("next") ?? "/";
  const next = safeNext(raw, url.origin);

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=1", url.origin));
}
