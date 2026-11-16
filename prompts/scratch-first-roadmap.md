# Trip Planner: scratch-first roadmap (Claude Code prompt)

You are working in the existing, live trip-planner app (Next.js 16 App Router, Supabase, TanStack Query, MapLibre, Tailwind 4, deployed on Vercel). Read these before anything else: `AGENTS.md` (the Next.js docs in `node_modules/next/dist/docs/` override your training data), `PRODUCT.md`, `DESIGN.md`, `README.md`.

## Product direction (new)

This app is becoming the owner's main trip-planning tool, and most of what gets typed into it never makes the final cut: hotel options, food places, attractions, ideas from friends. The app must behave like a scratchpad first and an itinerary second.

- **Everything starts as a draft.** Nothing counts toward budget, Home counters, itinerary totals or exports until the owner confirms it.
- **Viewers can vote and comment on drafts.** They still cannot edit the plan. This is a deliberate, narrow exception to "viewers never edit": update PRODUCT.md to say so.
- **Adding a lot of things quickly must be easy.**

## Working rules

- Evolve, do not rewrite. Existing data, URLs, copy and invite links keep working.
- Database changes are additive, reviewable migrations in `supabase/`. Never rewrite or backfill existing data without showing me the SQL and getting approval first.
- Security is enforced by RLS, not the UI. Extend `scripts/rls-check.ts` for every new table or policy, and run `npm run check:rls`.
- New UI (Phases 2, 4, 5): produce mockups first in `design/mockups/` (light and night, mobile and desktop, same naming as the existing files), then stop and wait for my approval before coding. Use the impeccable design skill. No emoji as icons. Keep AA contrast, 44px targets, reduced-motion support.
- Every phase ends with `npm run lint`, `npm run typecheck`, `npm test` and the Playwright e2e passing. Add or update tests for new logic.
- Do not commit unless I ask. Credentials: never read, print, log or ask for secrets from `.env.local` or Vercel; I add them myself. Server-only keys never get a `NEXT_PUBLIC_` prefix. See Phase 3.6 for the full rules, which apply to every phase.
- **Stop at the end of each phase and report.** Do not start the next phase on your own.

## Phase 1: fix the tab delay (do this now)

Symptom: clicking tabs (Plan, Spend, Pack, also Places) takes a few seconds. My read of the code, which you must verify by measuring before and after:

1. **Sub-tabs trigger server round trips.** `components/screens/plan.tsx` and `places.tsx` switch sections with `router.replace("?tab=…")`. The pages are dynamic (`connection()` in `lib/queries/prefetch.tsx`), so every switch refetches the whole page from the server. Replace this with `window.history.replaceState` (Next.js syncs it with `useSearchParams`; confirm in the Next 16 docs) or plain state. The target is zero network on a sub-tab switch.
2. **The server render is a waterfall.** `proxy.ts` calls `getClaims()`, then `Prefetch` calls `getClaims()` again, then runs `active_trip`, `is_admin` and `trip_role` one after another, and only then the table queries. Add a migration with one RPC (for example `trip_bootstrap()`) that returns the trip, admin flag and role in a single call, run the table fetches in parallel, and remove the duplicate auth check where RLS still protects the data.
3. **The gate remounts on every tab.** `TripGate` is rendered inside each screen, so the gate, `TripContext` and the realtime subscription (`useRealtimeSync`) are torn down and rebuilt on every route change. Check whether the other screens do the same. Hoist the gate into `app/(app)/layout.tsx` so it persists. Make sure the setup wizard (draft trip) still takes over correctly, probably without the app shell around it.
4. **The server prefetch is redundant in-app.** TanStack Query already holds the data (30 s stale time plus realtime). Keep the server prefetch for cold loads only, or drop it for client navigations. Decide from the measurements.
5. **Likely region mismatch.** Vercel functions default to Washington DC; my Supabase project is probably in Singapore. Do not change infrastructure. Tell me what to check and set (function region in the Vercel project settings versus the Supabase region).
6. **Perceived speed.** Keep the previous screen visible during a transition (`useTransition` or equivalent) instead of flashing skeletons. Add `loading.tsx` only where it helps.

Measure on a production build (`npm run build && npm start`), not `next dev`, because dev compiles routes on first visit and will mislead you. Report before and after: time to content for each tab switch, number of server requests per navigation, and time spent in each server await. Acceptance: a Plan or Places sub-tab switch makes no network request; a bottom-tab switch with a warm cache shows content immediately; any cold navigation makes at most one server round trip.

## Phase 2: drafts, voting and comments

Mockups first, then stop for approval.

**Model (additive):**
- Add `decision` (`draft | confirmed | dropped`, default `draft`) to `hotel_ideas`, `food_places` and `attractions`. Inspect `lib/database.types.ts` first. Propose, but do not run, a backfill: existing Planned/Priced/Booked/Done rows become `confirmed`, Idea/Maybe stay `draft`, Cancelled become `dropped`. Keep the existing `status` lifecycle for confirmed items.
- Add `votes` (trip_id, item_table, item_id, user_id, value `in | maybe | pass`, unique per item and user) and `comments` (trip_id, item_table, item_id, user_id, body, created_at). Use the polymorphic pair (item_table, item_id) with a CHECK on allowed table names, rather than merging the existing tables.
- **RLS is the crux.** Any trip member (owner, editor, viewer, including anonymous invite joiners) may insert, update and delete only their own vote and comment rows, only on a trip where `trip_role` is not null. The owner may delete any comment. Only the owner or editor can change `decision`. Add negative tests: a viewer cannot edit plan rows, cannot vote as someone else, and cannot vote on another trip.
- Viewers may be anonymous and have no name. Inspect how travelers and members are stored, and propose the smallest design for a per-trip display name asked on first vote.
- Update `lib/calc.ts`, `lib/home.ts` and `lib/export.ts` (and their tests) so only `confirmed` items count toward budget, counters and exports.

**UI:** a board in the style of an Airbnb wishlist: cards with a hero image, name, city, price, vote tally with member avatars, and comment count. Filters for Draft / Confirmed / Dropped, and sort by votes. Tapping a card opens a detail sheet with a comment thread. The owner gets Confirm and Drop actions. Viewers see vote and comment controls instead of edit controls (never dead buttons). Realtime updates for votes and comments.

**Scratch-first capture:** a quick-add reachable from every screen (including a keyboard shortcut on desktop), a multi-line "paste several" mode that creates one draft per line, and undo after deletion.

**Tentative itinerary stops:** each draft card gets an "Add to itinerary (tentative)" button. A tentative stop appears in its day as a dashed card, is excluded from totals, and links back to its source item. Confirming the source makes the stop solid; dropping the source removes it. Assumption to flag in your report: only the owner or editor can add tentative stops; viewers vote.

## Phase 3: Google Places suggestion engine (compliant caching, hard cost caps)

Radar and Foursquare are out of this plan (Radar moved to strict pay-as-you-go). **Google Places API (New) is the source for tourist spots and photos.** Keep Nominatim for destination geocoding in the wizard, and keep MapLibre with OpenFreeMap for the map. Implement everything as server-only modules in `lib/places/` plus Route Handlers under `app/api/places/`. The goal is to stay inside Google's free monthly allowances, which makes the app's cost zero, and to fail closed rather than ever bill me.

### 3.1 Facts to design around (checked 2026-11-06; re-verify before coding and tell me if anything differs)

- **Free allowances are per SKU, per month:** 10,000 for Essentials SKUs, 5,000 for Pro, 1,000 for Enterprise. The old pooled $200 credit is gone. Billing must still be enabled on the Google Cloud project, so a card is attached. The real protection is the quota caps in 3.5.
- **Free or near-free SKUs:** Text Search (IDs Only) and Place Details (IDs Only) are unlimited. Place Details Essentials is 10,000 free then $5 per 1,000. Text Search Pro, Nearby Search Pro and Place Details Pro are 5,000 free then $32, $32 and $17 per 1,000. Place Photos is an Enterprise SKU: 1,000 free then $7 per 1,000. A request is billed at the highest tier of any field in its field mask, so derive each field's tier from the official data-fields page and never guess.
- **Caching rules are strict.** Google's policy says not to pre-fetch, cache or store Places content beyond the allowed exceptions. **Place IDs may be stored indefinitely.** The service terms allow caching latitude and longitude for up to 30 consecutive calendar days, after which they must be deleted. Names, ratings, descriptions, reviews and photos cannot be stored. Read the current Places policies and Maps service-specific terms yourself and tell me if they differ, especially around using Places content on a non-Google map (MapLibre). My reading is that it is allowed with attribution.
- **Attribution:** show Google Maps attribution on any screen showing Places content; credit the author of every photo and review; link each photo to its `googleMapsUri`.

So "maximize caching" means exactly this, and nothing beyond it:
1. Store **place IDs** permanently, in the order Google returned them. This is the main cache and it is legitimate.
2. Store **coordinates for at most 30 days**, then null them out.
3. Store **Wikimedia Commons images** (URL, licence, attribution) permanently. They are free and cache-friendly.
4. Never store Google names, descriptions or photos. Fetch them live, only when needed.

### 3.2 Spike first (stop and report before building)

For Hanoi, Sapa, Fukuoka, Tokyo, Cebu and the destinations in the current seed trip, run IDs-only Text Search (`places.id` only) for sights, food and hotels, then Place Details for a sample. Report: result counts and quality, which SKU every field mask bills, and a cost model: Google calls per city discovery, per suggestion card, and per month for my usage (me planning, a few relatives viewing) measured against each free cap. Also test Wikimedia Commons coverage (a geosearch near the place's coordinates, then a name match) for the top sights. I decide which fields appear on cards based on the numbers.

### 3.3 Schema migration (additive; show me the SQL, do not run it)

Create `supabase/migrations/<timestamp>_places_refs.sql`. Match the conventions in `lib/database.types.ts`:

```sql
create table public.place_refs (
  id                uuid primary key default gen_random_uuid(),
  city_slug         text not null,                    -- e.g. 'vn-hanoi'
  category          text not null check (category in ('sight','food','hotel','other')),
  google_place_id   text not null,                    -- may be stored indefinitely
  position          integer not null,                 -- order Google returned the IDs in
  lat               double precision,                 -- nulled after coords_expires_at
  lng               double precision,
  coords_expires_at timestamptz,                      -- at most fetched time + 30 days
  image_url         text,                             -- Wikimedia ONLY, plain URL string
  image_source      text check (image_source in ('wikimedia')),
  image_attribution text,
  image_licence     text,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (city_slug, category, google_place_id)
);
create index place_refs_city_cat_idx on public.place_refs (city_slug, category, position);

create table public.place_fetch_log (                 -- single-flight lock + negative cache
  city_slug    text not null,
  category     text not null,
  status       text not null check (status in ('running','done','failed')),
  result_count integer,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  primary key (city_slug, category)
);

create table public.api_usage (                       -- app-level monthly call counter
  provider  text not null,
  sku_group text not null,
  month     date not null,
  calls     integer not null default 0,
  primary key (provider, sku_group, month)
);

alter table public.place_refs      enable row level security;
alter table public.place_fetch_log enable row level security;
alter table public.api_usage       enable row level security;

create policy place_refs_read on public.place_refs for select to authenticated using (true);
-- No other policies: place_fetch_log and api_usage are reachable only through the functions below.

-- Admin-only bulk write: one INSERT ... SELECT, i.e. one statement and one transaction.
create or replace function public.upsert_place_refs(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.place_refs
    (city_slug, category, google_place_id, position, lat, lng, coords_expires_at,
     image_url, image_source, image_attribution, image_licence, last_seen_at)
  select r.city_slug, r.category, r.google_place_id, r.position, r.lat, r.lng,
         case when r.lat is null then null else now() + interval '29 days' end,
         r.image_url, r.image_source, r.image_attribution, r.image_licence, now()
  from jsonb_to_recordset(p_rows) as r(
         city_slug text, category text, google_place_id text, position integer,
         lat double precision, lng double precision,
         image_url text, image_source text, image_attribution text, image_licence text)
  on conflict (city_slug, category, google_place_id) do update set
    position = excluded.position, last_seen_at = now(),
    lat = coalesce(excluded.lat, public.place_refs.lat),
    lng = coalesce(excluded.lng, public.place_refs.lng),
    coords_expires_at = coalesce(excluded.coords_expires_at, public.place_refs.coords_expires_at),
    image_url = coalesce(excluded.image_url, public.place_refs.image_url),
    image_source = coalesce(excluded.image_source, public.place_refs.image_source),
    image_attribution = coalesce(excluded.image_attribution, public.place_refs.image_attribution),
    image_licence = coalesce(excluded.image_licence, public.place_refs.image_licence);
  get diagnostics n = row_count;
  return n;
end $$;

-- Atomic, admin-only budget gate. Returns false once the month's cap is reached.
create or replace function public.reserve_api_call(p_provider text, p_sku text, p_cap integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.api_usage (provider, sku_group, month, calls)
    values (p_provider, p_sku, date_trunc('month', now())::date, 0) on conflict do nothing;
  update public.api_usage set calls = calls + 1
    where provider = p_provider and sku_group = p_sku
      and month = date_trunc('month', now())::date and calls < p_cap;
  return found;
end $$;

-- Daily job: coordinates past their 30-day limit are nulled, never kept.
create or replace function public.purge_expired_coords() returns void
language sql security definer set search_path = public as $$
  update public.place_refs set lat = null, lng = null, coords_expires_at = null
  where coords_expires_at < now();
$$;

revoke all on function public.upsert_place_refs(jsonb)           from public;
revoke all on function public.reserve_api_call(text, text, integer) from public;
revoke all on function public.purge_expired_coords()             from public;
grant execute on function public.upsert_place_refs(jsonb)           to authenticated;
grant execute on function public.reserve_api_call(text, text, integer) to authenticated;
-- purge_expired_coords is run only by the scheduler (pg_cron or a Vercel cron route); use the free option.
```

Add a stale-lock rule (a `running` log row older than 2 minutes is abandoned). Prove with `EXPLAIN ANALYZE` that the read query uses `place_refs_city_cat_idx`. Extend `scripts/rls-check.ts`: viewers cannot call the two admin functions, nobody can write `place_refs` directly, and `api_usage` and `place_fetch_log` are unreadable by clients.

### 3.4 Service logic (`lib/places/suggest.ts`), step by step

1. **Who can trigger it:** suggestions are owner-only. Viewers never cause a Google call; they see what the owner saved and voted on. Derive `city_slug` with a pure, unit-tested function (country code plus normalized locality, with an alias map).
2. **Read the cache:** `place_refs` by `city_slug` and category, ordered by `position`, only the columns needed. Coverage check: a category is satisfied with at least N IDs (default 20).
3. **Partial hit:** fetch only the missing categories. Single-flight through `place_fetch_log` so two requests never fan out twice; the loser returns cached IDs with `partial: true`.
4. **Discover IDs (free):** one Text Search per missing category with `places.id` as the only field mask (the IDs-only SKU), a query like "top tourist attractions in <city>", a location bias from the destination, and an `includedType` where it applies. Calls run in parallel through `Promise.allSettled`, with a concurrency cap, a 6 s `AbortController` timeout and one jittered retry on 429/5xx. The request has an overall deadline below the route's `maxDuration`; return partial results instead of timing out.
5. **Details only for what is on screen:** show the first 6 cards per day or category and fetch Place Details with the **smallest field mask that fills the card** (decide from the spike). More cards load on "Show more". Place Details results are used for display only and are not written to the database, except coordinates (30-day limit) when needed for ordering.
6. **Images, cheapest first:**
   1. A cached Wikimedia Commons image, found by a geosearch near the place's coordinates and a name match, done once, then stored with licence and attribution.
   2. A Google photo, **only when the user expands a card that has no Wikimedia image**: one photo, `maxWidthPx` around 480, requested with `skipHttpRedirect=true` so the response contains a short-lived `photoUri`. Never store it. Show the author attribution and the link to `googleMapsUri`.
   3. Otherwise a neutral placeholder. Validate any image URL before showing it (https, content type `image/*`, short timeout); an invalid one becomes `null` and never fails the card.
7. **Normalize and dedupe** on `google_place_id`; drop results outside the city radius.
8. **Write back in one call:** `supabase.rpc("upsert_place_refs", { p_rows })`, chunked at 500 rows if needed. A failed write is non-fatal: log it, return the results, mark the log row `failed`.
9. **Assemble the itinerary in code** from pure, unit-tested functions: anchors are the first-ranked sights; then proximity chaining by nearest-neighbour haversine distance from the previous stop, N stops per day within a maximum daily radius, with meal stops slotted at meal times. Return `{ days, partial, source: "cache" | "api" | "mixed" }`. Everything returned is a **tentative suggestion** (the Phase 2 concept); nothing is saved until the owner acts.
10. **Saving a suggestion to the trip (as a draft):** store `google_place_id`, coordinates with a `coords_fetched_at` timestamp, and the name only as a field the owner confirms or edits in the save sheet. Refresh coordinates lazily with Place Details when older than 25 days (capped, owner session only). If the cap is reached, hide the pin rather than show stale coordinates. Tell me about the residual terms risk of the name copy.

### 3.5 Cost and quota guard (build this before any Google call)

- Every Google call first calls `reserve_api_call(provider, sku_group, cap)`. Default caps are **80% of each SKU's free allowance**, kept in one config file and overridable by env var (for example Text Search Pro 4,000, Place Details Pro 4,000, Photos 800). At the cap, **fail closed**: serve cached IDs only and show "Suggestions are paused until the 1st (monthly limit reached)". Never fall through to paid usage.
- Dedupe in-flight identical requests within one server request only, using the same promise. Do not keep a time-based in-memory cache on the server (that is caching Places content). A short-lived in-memory cache inside the browser tab (React state or TanStack Query, never localStorage) is acceptable; say in your report if you think it is a risk.
- Debounce typing (400 ms), require at least 3 characters, use autocomplete session tokens, and end each session with the cheapest Place Details call that qualifies. Check the billing rules for session termination in the docs.
- Give me the exact Google Cloud console steps (or `gcloud` commands) to set per-API **daily quota limits** and a budget alert. Do not run them yourself and do not ask me for credentials.

### 3.6 Credential safety (non-negotiable, applies to every phase)

- The Google key is `GOOGLE_MAPS_SERVER_KEY`, server-only. **No `NEXT_PUBLIC_` prefix, ever.** Add a placeholder line to `.env.example` with no value. Never read, print, log or ask for the real value in `.env.local`; I will add it myself in `.env.local` and in Vercel as a Sensitive variable.
- Send the key only in the `X-Goog-Api-Key` request header, never in a URL or query string, so it cannot end up in logs. **Place Photos media URLs embed the key as a query parameter by default; never return such a URL to the browser.** Use `skipHttpRedirect=true` and return only the keyless `photoUri`, or stream the bytes through a signed-in Route Handler.
- Route Handlers require a signed-in owner (`is_admin`), validate input with zod (length limits, allowed categories), and rate-limit per user. Return generic error messages. Never forward Google's raw error bodies, headers or request URLs to the client or logs.
- Use two keys, one for development and one for production, each restricted in Google Cloud to **Places API (New) only**. Tell me what to do about IP restrictions on Vercel, where function IPs are not fixed on my plan; the API restriction plus quotas is the protection I can rely on.
- Keep `SUPABASE_SERVICE_ROLE_KEY` off Vercel (per the README). The admin-only SQL functions above exist so no service-role key is needed.
- Add `npm run check:secrets`. It must (a) fail if any `NEXT_PUBLIC_*` variable name or value looks like a Google key (`AIza…`), (b) after `npm run build`, scan `.next/static` and the client bundles for the key's name or an `AIza` pattern, and (c) scan the working tree and `git log -p` for `AIza`-style strings. Run it, and if it finds anything, stop and tell me so I can rotate the key.
- Confirm `.gitignore` covers `.env*` (except `.env.example`) and that `.env.local` was never committed.

### 3.7 Error handling and edge cases (all tested)

- Google down, 429 or timeout: return cached IDs with `partial: true`. If a stored place ID returns NOT_FOUND, re-run the text search for that city once and drop the stale ID.
- A city with zero results: log `done` with `result_count = 0` and treat it as a 1-day negative cache so it is not re-queried.
- Cap reached mid-request: return what was fetched, mark `partial`, show the paused message.
- Invalid or expired image: placeholder, no error shown.
- Tests: pure-function unit tests (slug, dedupe, chaining, URL validation, cap arithmetic), e2e against a fake Google server added to `e2e/` so no test ever calls the real API or needs a key.

### 3.8 UI

Suggestions per day as cards: name, category, distance; photo, description and rating on expand. Buttons: "Add to itinerary (tentative)" and "Save to ideas (draft)". Show the required Google Maps attribution, photo author credit and `googleMapsUri` link, and Wikimedia credit where used. Make it visible when the cap has paused suggestions.

## Phase 4: pictures

Hotel room photos have no legal free API, so do not scrape Agoda, Booking or similar. Build in this order:
1. **Paste a link or image URL.** A server route fetches the page's `og:image`. Owner only, https only, block private and loopback addresses (including after redirects), enforce size and time limits and an image content-type check.
2. **Upload** to a Supabase Storage bucket per trip with RLS, resized client-side to about 1280 px. Check the free storage quota in my project and tell me.
3. **Google photos** for suggestions follow Phase 3: Wikimedia first (cached), a Google photo only on explicit expand, never stored, with author attribution.
4. **Wikimedia Commons** for landmarks, keeping licence and attribution.

Add `item_images` (trip_id, item_table, item_id, url or storage_path, source, attribution, position); the first image is the card's hero. Render third-party URLs with `referrerPolicy="no-referrer"` and a placeholder on error.

## Phase 5: flight details as a ticket

Restyle `components/plan/flights.tsx` and `flight-sheets.tsx` as a boarding pass: perforated divider, large IATA codes using the existing board-style numerals sparingly, airline and flight number, date and times, duration, layover, status chip, and optional terminal, gate and seat (added as nullable columns). Any barcode-like graphic is purely decorative and must be `aria-hidden` so it never looks scannable. The booking reference (PNR) can be used to manage a booking, so show it to the owner only, or masked for viewers. Mobile stacks; desktop is horizontal; light and night. Mockups first, then stop for approval.

## Start

Begin with Phase 1. First report what you measured, then make the changes, then report the numbers, and stop.
