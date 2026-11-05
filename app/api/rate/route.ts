import { cacheLife } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/require-user";

const Query = z.object({
  from: z.string().regex(/^[A-Z]{3}$/),
  to: z.string().regex(/^[A-Z]{3}$/),
});

const ErApi = z.object({
  result: z.literal("success"),
  base_code: z.string(),
  time_last_update_unix: z.number(),
  rates: z.record(z.string(), z.number()),
});

/** Latest rates for one base currency from open.er-api.com (free, no key). Cached for an hour per base. */
async function latestRates(base: string) {
  "use cache";
  cacheLife("hours");
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error(`Rate service returned ${res.status}`);
  return ErApi.parse(await res.json());
}

/** GET /api/rate?from=VND&to=PHP → { rate: 1 VND in PHP, date: "YYYY-MM-DD" } */
export async function GET(request: Request) {
  if (!(await requireUserId())) return Response.json({ error: "Not signed in" }, { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Query.safeParse({ from: params.from?.toUpperCase(), to: params.to?.toUpperCase() });
  if (!parsed.success) return Response.json({ error: "Use 3-letter currency codes" }, { status: 400 });
  const { from, to } = parsed.data;

  try {
    const data = await latestRates(from);
    const rate = data.rates[to];
    if (rate === undefined) return Response.json({ error: `No rate for ${from} → ${to}` }, { status: 404 });
    const date = new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10);
    return Response.json({ rate, date }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch {
    return Response.json(
      { error: "The exchange-rate service is unavailable. Enter the rate by hand." },
      { status: 502 },
    );
  }
}
