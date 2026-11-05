import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

/** Per-request client for Server Components, Server Actions and Route Handlers. Uses the caller's session (RLS applies). */
export async function createSupabaseServer() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
