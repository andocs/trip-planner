# Trip Planner

A phone-first web app where a small group plans **one trip together**: budget and expenses with
settle-up, a day-by-day itinerary, flights, stays, food spots with menu prices, sights, packing and
pasalubong. It replaces a Google Sheets planner: same data, but tap-to-edit instead of cells.

- **Invite-only.** Nothing is visible without an invite link or an account. Only the owner (a Google
  account you list in `app_admins`) can create and edit trips; everyone else is a **viewer**: read-only,
  in the UI and in the database.
- **Live.** Edits on one phone appear on the others within a second.
- **Installable** as an app (PWA), light and night themes, works on desktop too (sidebar ≥ 1024 px).

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, RLS, Realtime,
Anonymous Auth) · TanStack Query · react-hook-form + zod · Recharts · Google Maps (Maps JavaScript API, Places API (New)) · SheetJS.

---

## Deploy in ~15 minutes

You need a GitHub account, a [Supabase](https://supabase.com) account and a
[Vercel](https://vercel.com) account. All free tiers work.

### 1. Supabase project (≈ 5 min)

1. **Create a project** at supabase.com (any region close to you). Wait until it's ready.
2. **Turn on sign-in methods:** Authentication → Sign In / Providers →
   - **Allow anonymous sign-ins** (used by invite links),
   - **Google**: create an OAuth client in Google Cloud (type _Web_), add the redirect URI
     `https://<project-ref>.supabase.co/auth/v1/callback`, paste its client ID and secret here,
   - Authentication → Sign In / Providers → **Allow manual linking** (lets a link viewer attach Google to keep access).
3. **Create the database:** SQL Editor → New query. Paste each file from
   [`supabase/migrations/`](supabase/migrations/) **in filename order** and click Run each time:
   1. `20261105000001_schema.sql`
   2. `20261105000002_security.sql`
   3. `20261105000003_realtime.sql`
   4. `20261105000004_half_nights.sql`
   5. `20261106000005_roles_expand.sql` (additive, safe to run any time)
   6. `20261106000006_roles_cutover.sql` (**run together with the app update**: after it only the owner can write)
   7. `20261107000007_onboarding.sql` (setup wizard: draft trips, `save_onboarding`, `finish_onboarding`; run with the same deploy)

   (Prefer the CLI? `npx supabase login`, `npx supabase link --project-ref <ref>`, `npm run db:push`.)

4. **Make yourself the owner:** sign in once with Google in the app, then run
   `insert into app_admins(email) values ('<your google email, lowercase>');` in the SQL editor.
   (Existing trips show a one-time **Claim this trip** step the first time you sign in.)
5. **Prove the security rules:** paste [`supabase/tests/rls_check.sql`](supabase/tests/rls_check.sql)
   and run it. It shows as an _error_ reading **`RLS CHECK PASSED (106 checks)`**. That's intended:
   it raises an error on purpose so nothing is saved.
6. **Copy your keys:** Project Settings → API → _Project URL_ and the _anon / publishable_ key.

### 2. Run it locally (optional, ≈ 2 min)

```bash
npm install
cp .env.example .env.local   # paste the URL and anon key
npm run dev                  # http://localhost:3000
```

Sign in with Google (see the setup steps above), follow the **setup wizard** (map, nights, dates, travelers,
money), then Settings → **Copy link** and open it in a private window to see a viewer. To fill a trip with the
Vietnam ’26 example for testing, run `npm run seed -- --token <invite token of an empty trip>`.

### 3. Deploy to Vercel (≈ 5 min)

1. Push this repo to GitHub.
2. Vercel → **Add New → Project** → import the repo (framework: Next.js, defaults are fine).
3. Add **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - optional `GEOCODER_CONTACT` (see below)
4. **Deploy.**

### 4. Point Supabase at your site (≈ 1 min)

Supabase → Authentication → URL Configuration → **Site URL** = your Vercel URL
(e.g. `https://trip-planner-xyz.vercel.app`). Add `http://localhost:3000` under _Redirect URLs_ if you
develop locally. (Only needed for the future "Save my access" email link; anonymous sign-in itself
doesn't use it.)

Done. Open the Vercel URL on your phone, add it to the home screen, and share the invite link.

---

## Environment variables

| Name                            | Where                 | Purpose                                                                                  |
| ------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `.env.local`, Vercel  | Supabase project URL                                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, Vercel  | anon / publishable key. Safe in the browser: Row Level Security protects the data        |
| `GEOCODER_CONTACT`              | optional, anywhere    | URL or email added to "Find coordinates" requests, as OpenStreetMap's usage policy asks  |
| `NOMINATIM_USER_AGENT`          | optional, anywhere    | Full User-Agent for place search (overrides the default; Nominatim requires an identity) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | browser (public by design) | Google Maps JavaScript API key. Restrict it by HTTP referrer AND to the Maps JavaScript API only |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | browser | Cloud-styled Map ID (light and night) |
| `GOOGLE_MAPS_SERVER_KEY` | **server only** | Places API (New) key. Never prefix with `NEXT_PUBLIC_`. Restrict to Places API (New) only |
| `SUPABASE_SERVICE_ROLE_KEY`     | `.env.local` **only** | For `npm run seed -- --token …`. Bypasses RLS: **never** put it on Vercel                |
| `APP_URL`                       | `.env.local` only     | Base URL used in the invite link that `npm run seed` prints                              |

---

## Google Maps and Places

The map is Google Maps (Maps JavaScript API). **Discover** (Places → Discover, owner only) suggests sights, food and stays
from the Places API (New). Nothing in this section can run up a bill unnoticed: calls are capped in the database, in
Google Cloud, and by a budget alert. Set it up once per environment.

**Two Google Cloud projects, four keys.** Use a `-dev` and a `-prod` project, each with its own pair:

| Key | Used by | Restrict to |
| --- | ------- | ----------- |
| Server key (`GOOGLE_MAPS_SERVER_KEY`) | the `/api/places/*` routes | **API: Places API (New) only.** Application restriction: None (Vercel has no fixed IPs) |
| Browser key (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`) | the map in the browser | **API: Maps JavaScript API only. Application: HTTP referrers** (prod: your domain; dev: `http://localhost:3000/*` and your Vercel preview URLs) |

Also create a **Map ID** per project (Google Maps Platform → Map Management → JavaScript, vector) and set it as
`NEXT_PUBLIC_GOOGLE_MAP_ID`.

**Where each value goes.** `.env.local`: the dev values. Vercel → Settings → Environment Variables: Production gets the
prod values; Preview and Development get the dev values. `GOOGLE_MAPS_SERVER_KEY` is a Sensitive variable. Never put
`SUPABASE_SERVICE_ROLE_KEY` on Vercel. The browser key is the **only** `NEXT_PUBLIC_` Google key allowed.

**Spending limits (do these in each project).**

1. APIs & Services → Library: enable only **Places API (New)** and **Maps JavaScript API**.
2. APIs & Services → Places API (New) → Quotas & System Limits: set per-day caps that add up to under the monthly free
   allowance, for example Place Details Pro about 120/day, Place Details Enterprise and Text Search Enterprise about
   25/day, Place Photos about 25/day. Maps JavaScript API: map loads about 250/day. Google then refuses calls instead of billing them.
3. Billing → Budgets & alerts: a small budget (for example $5) scoped to the project, alerts at 50%, 90% and 100%.
   A budget only emails you; it does not stop spending. The quotas and the database cap are the brakes.
4. The app also reserves every billable call in the database (`reserve_api_call`, migration 10) against a hard monthly
   cap of 80% of each free allowance, and refuses further calls (it fails closed) with a calm "paused until next month".

**What is stored, and what is not.** Google's terms allow keeping place IDs and, for up to 30 days, coordinates. So the
database keeps only `place_refs`: the place ID, coordinates with a timestamp (purged after 30 days), and an optional
**Wikimedia Commons** photo with its author and licence. Google names, ratings, hours, descriptions and photos are
loaded live for the owner and never stored. Viewers never trigger a Google call: they see the saved photo, its credit, and an
"Open in Google Maps" link.

**Safety checks.** `npm run check:secrets` fails if a `NEXT_PUBLIC_*` name or value looks like a Google key (except the
one browser key), or if an `AIza…` key is in the built bundles, the working tree or `git log -p`. Run `npm run build`
first to include the bundle scan, and run it with `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` set so that one key is recognised.
If it ever reports a key, rotate that key in Google Cloud Console straight away. `npm run check:rls` covers the new tables and the cap guard.

---

## Photos on ideas

Every hotel, food spot and sight can carry up to 12 photos; the first is the card's cover. The owner adds them (viewers only
look). Three kinds, all in the `item_images` table (migration 11):

| Kind | How | What is kept |
| ---- | --- | ------------ |
| **Upload** | Choose a photo. It is shrunk on the phone to 1280 px (JPEG) first. | A file in the private `trip-photos` bucket, shown through short-lived signed links |
| **Link** | Paste a page (hotel, restaurant, sight) or a picture address. The server finds the page's `og:image`. | The picture's address and a credit, not a copy |
| **Wikimedia** | Added automatically when a Google suggestion is saved and a free Commons picture exists. | The address, author and licence (shown on the card) |

Hotel room photos have no legal free source, so nothing is scraped. Pasting a link is the owner's own choice of one picture.

**Storage.** The free Supabase plan has 1 GB of file storage. The database refuses uploads past **900 MB** (90%, `photo_storage_cap()` in
migration 11, change it if you move to a bigger plan), and the add-photo sheet shows the meter. Uploaded photos average about
200 KB, so 900 MB is several thousand. Links use no storage. Deleting an idea removes its photo rows; the app removes a file when you
remove its photo. If anything is left behind, `npm run photos:orphans` lists it (add `-- --delete` to remove it; it needs the
service-role key in `.env.local`, never on Vercel).

**Safety of pasted links.** The link is opened by the server for the owner only, so it is treated as a request the server makes on
someone's behalf: https only, port 443, no bare IP addresses or local names, every address the name resolves to must be public and the
connection is pinned to the checked address, redirects are re-checked (at most 3), 6 seconds, 512 KB of HTML, the picture must be a
JPEG/PNG/WebP under 10 MB, and only the picture's address ever leaves the server. Third-party pictures load in the browser with no
referrer, and a picture that fails to load shows a "Photo unavailable" placeholder. Note that a viewer's browser contacts the picture's
site (or Wikimedia) directly when it loads such a photo.

---

## Flights as boarding passes

Each flight is drawn as a boarding pass: airline and number, airport codes, local times (with "+1" for a next-day landing), terminal, gate and seat. Times are the local time at each airport, so a layover between two connecting flights is exact, but the length of a flight is only shown if you type it in. Booked or Done flights and stays have a **Log as expense** button that records the fare once (the planned budget counts it as Planned; the expense counts it as Spent).

The **booking reference** is kept in its own owner-only table (`flight_refs`, migration 13), so viewers cannot read it from the API; they only see that one exists. References saved before migration 13 stay in `flights.booking_ref` and remain API-readable by viewers until you review and run `supabase/proposals/move_booking_refs.sql` (not run automatically).

## How access works

| Who                     | Gets                                                                | How                                                                             |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Owner**               | Create and edit everything, replace the invite link, remove viewers | Signs in with Google; the email must be in `app_admins`                         |
| **Viewer**              | Read everything, change nothing                                     | Opens `/join/<token>` (anonymous session) or signs in with Google after joining |
| **Signed in, no trip**  | A "No access" page                                                  | Not the owner, never joined                                                     |
| **Signed out, no link** | Only the "Invite only" page, on every route                         | —                                                                               |

- Row Level Security on every table checks the caller's **role** on the trip (`owner | editor | viewer`;
  nothing grants `editor` today). Viewers can read; every write, including through the API, is refused.
  Hiding buttons is a courtesy; the database is the enforcement.
- The only way onto a trip is `join_trip(token)`, which always adds a **viewer** and never upgrades anyone.
  The invite link `https://<app>/join/<token>` is that token; it is removed from the address bar after joining.
- Settings → **New link** replaces the token and signs out everyone who joined with the old one (they can come
  back with the new link). Settings → **Viewers** removes one person; a removed viewer stays out even with the
  same link.
- An anonymous viewer's session lives in the browser. Settings → **Keep access with Google** attaches a Google
  account so access survives clearing site data or switching phones.
- Turn on **CAPTCHA (Turnstile)** for anonymous sign-ins in Supabase (Authentication → Attack Protection) to keep
  bots from creating throwaway sessions.

### Rolling out the role change (existing data)

1. **Back up first:** `npx supabase db dump -f backup-schema.sql` and `npx supabase db dump --data-only -f backup-data.sql`
   (after `npx supabase link --project-ref <ref>`).
2. Run migration **5** (additive: new columns and helper functions, no behaviour change). Every existing
   member becomes a viewer; existing trips keep their data and invite links.
3. Deploy the app, then run migration **6** straight after (the old app would show edit buttons that now fail).
4. Sign in with Google, insert your email into `app_admins`, reload, and **Claim this trip**.
5. **Rollback:** run [`supabase/rollback/rollback_cutover.sql`](supabase/rollback/rollback_cutover.sql) and redeploy the
   previous version. Data is untouched; the new columns stay.

Other safeguards: no referrer is sent (the token never leaks to linked sites), the app can't be
framed, transfer links must be `http(s)`, and the `/api/rate` and `/api/geocode` helpers only answer
the owner so they can't be used as open proxies.

---

## Everyday use

- **One active trip.** Settings → **Start a new trip** archives the current one (optionally keeping
  travelers, currencies and the rate). Current viewers and the invite link move to the new trip.
- **Export to Excel** (Settings) downloads the whole trip: Trip, Budget (+ settle-up), Expenses,
  Itinerary, Flights (+ transfers), Stays (+ hotel ideas), Food (+ menus), Attractions, Packing
  (+ pasalubong, reminders).
- **Undo.** Every delete shows Undo for 6 seconds. The real delete only happens after that, so
  Undo restores everything, including links from other rows.
- **Money.** Foreign-currency amounts convert at the trip's rate (Settings → Live rate fetches today's
  rate from open.er-api.com). Expenses are split equally; Spend → Settle up lists the fewest transfers.

### About the Vietnam ’26 example

`seed/vietnam26.seed.json` is loaded as-is, with these adjustments:

- Two expenses had no date; they're placed on the trip start date with the note "Date not recorded".
- Itinerary day numbers are kept from the workbook (Day 1 = 19 Jun). New activities with a blank
  day are numbered from the trip start (16 Jun = Day 1).
- One hotel idea is a half-day stay (0.5 nights), which is why migration 4 allows half nights.
- Flight times are local wall-clock times at each airport (stored without a time zone).

---

## Development

| Command                       | What it does                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server on :3000                                                                                                                     |
| `npm run lint`                | ESLint                                                                                                                                  |
| `npm run typecheck`           | `tsc --noEmit`                                                                                                                          |
| `npm run test`                | Vitest unit tests (money, settle-up, dates incl. DST, seed mapping, export, realtime merging)                                           |
| `npm run test:e2e`            | Playwright smoke tests against an in-memory fake Supabase (no project or network needed)                                                |
| `npm run build`               | Production build                                                                                                                        |
| `npm run format`              | Prettier                                                                                                                                |
| `npm run check:rls`           | Real Supabase sessions (owner, viewer, stranger) against the **local** stack (`npx supabase start`); add `-- --remote` for your project |
| `npm run seed`                | Creates a new example trip on your project and prints its invite link                                                                   |
| `npm run seed -- --token <t>` | Loads the example into an existing **empty** trip (needs `SUPABASE_SERVICE_ROLE_KEY`)                                                   |
| `npm run db:push`             | Apply migrations to the linked project                                                                                                  |
| `npm run db:types`            | Regenerate `lib/database.types.ts` from the linked project                                                                              |

First-time Playwright setup: `npx playwright install chromium`.
`SCREENS=1 npx playwright test screens` saves screenshots of every screen (light and dark) to
`e2e/screens/`.

### Project layout

```
app/                 routes: / (Home), /spend, /plan, /places, /pack, /settings, /join/[token], /login, /invite-only, /auth/callback
  actions/           server action: load example
  api/rate, geocode  route handlers (session required, cached)
components/          screens, per-feature lists, *-sheet.tsx forms (lazy-loaded), ui/ primitives
lib/
  calc.ts            all trip maths (unit-tested)
  queries/           TanStack Query hooks, optimistic writes, server prefetch, trip actions
  realtime*.ts       live sync
  seed-map.ts        workbook JSON → database rows
  export.ts          Excel workbook builder
  supabase/          browser/server clients
supabase/
  migrations/        schema, RLS + RPCs, realtime, half nights
  tests/rls_check.sql   role-based RLS proof (106 checks); also run locally in Docker
  rollback/            rollback_cutover.sql (by hand, not a migration)
e2e/                 Playwright tests + fake Supabase (HTTP + Realtime socket)
scripts/             seed.ts, rls-check.ts, make-icons.mjs
```

### Notes for contributors

- This is Next.js 16: middleware is `proxy.ts`, and `cacheComponents` is on, so anything reading
  cookies must sit inside `<Suspense>`. See `AGENTS.md`.
- Screens prefetch their data on the server for returning visitors (`lib/queries/prefetch.tsx`), so
  the first HTML already has content; first-time visitors fetch in the browser.
- Add/edit forms live in `*-sheet.tsx` files and load on first open, keeping zod,
  react-hook-form and the drawer out of each page's initial JavaScript.
- No `any` in app code; the generic table helpers cast through `unknown` in one place
  (`lib/queries/table.ts`) because supabase-js can't type a union of table names.

---

## Quality status

| Check                                                   | Result                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint / typecheck / unit tests / build                   | Pass (66 unit tests)                                                                                                                                                      |
| Playwright smoke tests                                  | 28 pass (per-role access + the setup wizard)                                                                                                                              |
| RLS proof (`rls_check.sql`)                             | 106 checks pass on local Supabase (Postgres 17); `npm run check:rls`: 19 live checks                                                                                      |
| `npm audit`                                             | 0 vulnerabilities                                                                                                                                                         |
| Lighthouse (accessibility, best practices, performance) | **Not re-measured after the redesign.** Before it: accessibility 100, best practices 96, performance 65–73 (target 90). Measure the deployed site with PageSpeed Insights |
| Installable (PWA)                                       | Manifest with 192/512 + maskable icons, standalone display, theme colour                                                                                                  |

**Performance.** Measured locally on a production build with simulated slow 4G and a 4× slower
CPU, as a returning user. Layout shift is ~0 and first paint ~0.8 s. The score is held back by
Lighthouse's estimate of when the largest text paints (≈ 4 s) and by React's start-up time
(0.5–1 s of blocking under 4× CPU slowdown). Even a near-empty page on this stack scored 83 locally.
Re-measure the deployed site with [PageSpeed Insights](https://pagespeed.web.dev/): Vercel's CDN and
HTTP/2 behave differently from `next start` on a laptop. The remaining levers are tracked below.

### Possible next steps

- An `editor` role: the database already understands `owner | editor | viewer`, but nothing grants `editor` yet.
- Hide the invite token from viewers (they can read it today, which equals "anyone with the link can view").
- Performance: serve the first screen's content without streaming behind a Suspense boundary
  (requires reworking the cached route handlers), or trim client-side libraries further.
- Content-Security-Policy header (needs nonces for Next's inline scripts).
