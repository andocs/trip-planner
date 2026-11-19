`# Trip Planner — Project Handover Guide
`
`**Project:** A Next.js 16 trip planning app (scratch-first: drafts/voting → planning → real booking). Live at Vercel, Supabase backend (Singapore region), Google Maps integration.
`
`**User:** Trip planner owner. Scratch-first approach: stop and report at each phase end; never start the next phase without explicit approval.
`
`---
`
`## Current Status (2026-11-16)
`
`**All 5 phases complete and built (uncommitted).** Ready for deployment.
`
`| Phase | Focus | Status | Tests |
`|-------|-------|--------|-------|
`| 1 | Tab delay fix (PPR cache) | ✅ Done | Pass |
`| 2 | Drafts, voting, comments | ✅ Done | Pass |
`| 3 | Google Places + caching | ✅ Done | Pass |
`| 4 | Photos on ideas | ✅ Done | Pass |
`| 5 | Boarding-pass flights | ✅ Done | Pass |
`
`**Migrations:** 1–13 applied to prod Supabase (Singapore). Local Docker has 1–13. Booking refs moved from `flights.booking_ref` (viewer-readable) to owner-only `flight_refs` table.
`
`**Test results:**
`- TypeScript: clean
`- ESLint: clean
`- Unit tests: 192 pass
`- Playwright e2e: 69 pass / 8 skipped (Google key tests)
`- Live RLS check: 95 checks pass
`- SQL suite: 253 checks pass
`
`---
`
`## Revision: Places / Stays / shared modal / itinerary (branch revision/places-stays-nav)
`
`Brief: merge the Plan tabs into Places, one add/edit modal per category, Stays redesign, dashboard reminders, and the
`itinerary rebuilt as mockup variant J (a card per place, drag-and-drop, commute and buffer connectors, day totals).
`Mockups live in `design/mockups/revision.html` (variants A to J; J is the chosen one; the folder is gitignored).
`
`- **Routes:** `/itinerary`, `/flights`, `/stays`, `/places` (Board + Discover; `?cat=stay|food|sight`). Old `/plan` and `?tab=`
`  links redirect in `proxy.ts` via `lib/legacy-routes.ts`. Phones: five tabs + More (Spend, Pack, Settings).
`- **Migrations 15 and 16** (additive, with rollbacks in `supabase/rollback/`): 15 = `details jsonb` on hotel_ideas, food_places, attractions, stays
`  and `deal_breaker` on the idea tables; 16 = `position`, `kind` (stop | commute | buffer) and `details` on itinerary_items, plus a position backfill.
`  Both applied to local Docker. Production: 15 and 16 need the user to run them (no CLI link or login from here).
`- **Shared modal:** `components/ideas/idea-modal.tsx`; pure logic in `lib/idea-details.ts` and `lib/idea-form.ts`.
`  No booking-reference field on ideas (viewers can read them); flights use `flight_refs`.
`- **Add/edit anatomy:** every form uses `components/ui/form-footer.tsx` ([Delete] [Cancel] [Add or Save], "Keep adding" above the buttons;
`  `RowSheet` and the idea modal both use it). The primary label is "Add" (adding) or "Save" (editing); draft or confirmed is the Status field.
`  "Keep adding" is on by default for places and expenses. The add sheet (button, N, Discover's "add by hand") is the idea modal with
`  **One place | Paste a list**, titled "Add place" (the category's own details fold away under "Stay/Food/Sight details" and open on edit; price is Price | Per | Currency)
`  (`components/ideas/paste-list.tsx`; opened from anywhere by `components/board/add-place.tsx`).
`  A save from Discover always closes. The old separate "Add ideas" sheet is gone.
`- **Itinerary:** pure rules in `lib/itinerary.ts` (order, connector rules, `planMove`, `planInsert`, day totals, stay marks, `LONG_DAY_MINUTES`)
`  and `lib/itinerary-rows.ts`. UI in `components/plan/itinerary*.tsx`, `connector-sheet.tsx`. @dnd-kit does the dragging (Reorder mode, owner/editor only).
`  **The day number is the source of truth:** a day's date is derived from the trip start and written to `on_date` on save; there is no date input.
`  Connectors are rows with `kind <> 'stop'`; `solidStops` (calc.ts) excludes them from every counter and the export.
`  Stays appear on their check-in / check-out days from the Stays page (not stored). The route map is the page hero: the header's background (`MapView` with `cooperative` gestures: Ctrl + scroll or two fingers zoom, the page still scrolls), with the title and pills on a dark gradient in the existing colours. The "Enlarge map" / "Reduce map" pill makes the header taller. It draws the solid, non-tentative stops that have a fresh saved place position (`place_refs`, 30 days), numbered as in the list, with an arrow on each leg in travel order. Stops without a position are counted ("N stops have no map position yet"), not drawn. The "Directions" pill opens the road route through those stops in Google Maps (`directionsUrl` in `lib/itinerary.ts`; a browser link, so no Google API call or quota). One Google map load per Itinerary visit, on every screen size.
`  Each stop card has one hamburger menu at its upper right (Radix DropdownMenu, `CardMenu` in `itinerary-entries.tsx`): Edit, Mark complete / Mark incomplete, Open on the board (drafts), Remove from itinerary (with the usual undo toast). It replaces the old Done circle, edit chevron and board link. In Reorder mode the drag handle takes its place; viewers get no menu.
`  Under each activity, `components/plan/add-here.tsx` is a 44px circle (shown on hover of the card's bottom edge, always on touch) that opens into
`  **Commute | Rest | Activity**; Activity inserts at that spot (`planInsert`). Not offered next to a commute or rest, in Reorder mode, or to viewers.
`- **Home reminders:** `lib/reminders.ts` + `components/home/reminders-card.tsx`; dismissals live in localStorage.
`- Checks at last run: live RLS 107, SQL suite 267, unit 258, e2e 96 passed / 8 skipped (RLS numbers unchanged: no database changes since).
`
`## Architecture Overview
`
`### Tech Stack
`- **Frontend:** Next.js 16 (App Router, PPR, Suspense)
`- **Database:** Supabase PostgreSQL (Singapore, ap-southeast-1)
`- **Auth:** Supabase Auth (magic link for guests; Google for admin)
`- **State:** TanStack Query + HydrationBoundary (hydration fix via boot snapshot)
`- **UI:** React, Tailwind 4, shadcn/ui, Lucide icons
`- **Maps:** Google Maps JS (@vis.gl/react-google-maps, replaces MapLibre)
`- **Storage:** Supabase Storage (trip-photos bucket, 900 MB cap = 90% of free 1 GB)
`- **E2E:** Playwright (fake Supabase mock for CI)
`- **Testing:** Vitest (unit), PGlite + real Postgres (SQL/RLS)
`
`### Key Files
`- `app/(app)/` — main app routes (plan, places, pack, spend, settings)
`- `lib/queries/` — TanStack Query hooks (trips, flights, expenses, etc.)
`- `lib/supabase/client.ts` — Supabase client, RLS enforcement
`- `components/trip-gate.tsx` — hydration fix; wraps app with boot snapshot
`- `components/plan/` — flights (boarding-pass.tsx), stays, itinerary, transfers
`- `components/places/` — Discover tab (Google Places search + caching)
`- `lib/database.types.ts` — hand-patched type overrides for new columns
`- `supabase/migrations/` — 13 idempotent migrations (additive only)
`- `supabase/tests/rls_check.sql` — 253 RLS + mutation checks
`- `scripts/rls-check.ts` — live RLS check against any Supabase instance
`
`---
`
`## Phase Breakdown
`
`### Phase 1: Tab Delay (2026-11-06)
`**Problem:** Switching tabs in `/plan` was slow (UI lock on first render).
`**Solution:** PPR + React 19 cache + `preload()` to prefetch queries before the tab renders.
`**Files:** `lib/queries/prefetch.tsx`, `components/screens/home.tsx` (useTransition), sheet navigation.
`**Result:** Tabs now switch instantly.
`
`### Phase 2: Drafts, Voting, Comments (2026-11-06)
`**Focus:** Scratchpad-first: ideas (attractions, restaurants) with statuses (Idea → Maybe → Confirmed → Dropped).
`**DB:** `attractions`, `restaurants`, `votes`, `comments`, `idea_notifications` (migrations 2–5).
`**Features:**
`- Quick-add button (N key) in Board view for capturing ideas
`- Vote bars showing confidence
`- Comments with real-time updates
`- Itinerary groups ideas into days (Day 1, Day 2, etc.)
`**RLS:** Ideas are trip-wide; viewers can vote/comment but not change status.
`**Files:** `components/board/`, `components/screens/home.tsx`, `lib/calc.ts` (decision logic).
`
`### Phase 3: Google Places (2026-11-07 to 2026-11-10)
`**Focus:** Auto-suggest attractions/restaurants from Google Places, with cost cap (80% of free tier).
`**DB:** `place_refs` (Place ID + 30-day cached coords + Wikimedia photo metadata). Migration 10.
`**API Endpoints:**
`- `/api/places/search` — Text Search
`- `/api/places/details` — details (rating, hours, formatted address)
`- `/api/places/photo` — og:image fetch (SSRF-hardened link proxy)
`- `/api/places/image` — resize/sign storage URLs
`**Rate Limit:** `reserve_api_call` RPC caps at 80% of free tier, fails closed.
`**Quirk:** Real Google data (openNow, regularOpeningHours) not verified in local e2e (blanked keys).
`**Files:** `app/api/places/`, `lib/cache.ts` (30-day TTL), `/app/(app)/places/page.tsx` (Discover tab).
`
`### Phase 4: Photos (2026-11-11 to 2026-11-16)
`**Focus:** Add photos to any idea (attraction, restaurant, etc.). Private bucket with 900 MB cap.
`**DB:** `item_images` (replaces place_refs photo columns). Migration 11.
`**Storage:** `trip-photos` bucket (owner uploads, viewers see signed URLs).
`**Features:**
`- Gallery grid with cover photo selector
`- Resize to 1280 px client-side before upload
`- Signed URLs expire after 60 min (viewers can't share permanent links)
`- Orphan cleanup script (`scripts/photo-orphans.ts`)
`**RLS:** Viewers can see photos (via signed URL) but not upload/delete.
`**Files:** `components/photos/`, `/app/(app)/places/page.tsx` (gallery), `app/api/photos/link.ts`.
`
`### Phase 5: Boarding-Pass Flights (2026-11-16)
`**Focus:** Each flight is a boarding pass: airline, codes, times, terminal/gate/seat, booking ref, fare.
`**DB:**
`- `flights` columns added: `terminal`, `gate`, `seat`, `duration_min` (nullable), `has_ref` flag. Migration 13.
`- `flight_refs` — new owner-only table for booking references (PNR). Migration 13.
`- `expenses` — added `source_table`, `source_id` (one expense per flight/stay). Migration 12.
`**Features:**
`- Boarding-pass UI with perforation notch, board numerals (date), layover pills for connections
`- Flight time only shown if owner types it (can't compute from local times)
`- Next-day landing shows "+1"
`- Booking reference hidden from viewers (shows "••••••" with lock icon)
`- Log as expense button (Booked/Done only) with planned budget tracking
`- Planned budget counter (Budget / Planned / Spent / Left)
`- Flip animation on numbers (reduced-motion safe), pop-in on Log
`**RLS:**
`- Viewers cannot read `flight_refs` (booking refs stay private)
`- `flights.has_ref` flag tells viewers a ref exists (without showing it)
`- Old `flights.booking_ref` values left untouched; use `supabase/proposals/move_booking_refs.sql` to migrate (not run automatically)
`**Files:** `components/plan/boarding-pass.tsx`, `components/plan/flights.tsx`, `components/plan/flight-sheets.tsx` (edit form), `lib/flights.ts` (helpers), `components/ui/flap-digits.tsx`, `components/ui/animated-number.tsx`.
`
`---
`
`## Standing Rules (Never Break These)
`
`1. **Stop at phase end.** Report status; wait for approval before the next phase.
`2. **No rewrites or backfills** without SQL shown and approval. All DB changes are additive migrations in `supabase/migrations/`.
`3. **RLS is security.** Extend `scripts/rls-check.ts` for every new table/policy; run `npm run check:rls` before finishing.
`4. **Secrets never printed.** Never read, log, or print `.env.local` or Vercel env vars. User adds them.
`5. **Server keys stay server-only.** `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_MAPS_SERVER_KEY` never get `NEXT_PUBLIC_` prefix.
`6. **Quality gate.** Each phase ends with: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx playwright test` (all pass).
`7. **No commits unless asked.** All work uncommitted until user says so.
`8. **Design mockups first** (Phases 2, 4, 5). Mockups must be approved in `design/mockups/` before coding. Light + night theme, AA contrast, 44 px targets, no emoji icons, reduced-motion safe.
`
`---
`
`## Current Env Setup
`
`**.env.local** (local dev):
````
`NEXT_PUBLIC_SUPABASE_URL=https://your-singapore-project.supabase.co
`NEXT_PUBLIC_SUPABASE_ANON_KEY=...
`GOOGLE_MAPS_SERVER_KEY=...
`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
`NEXT_PUBLIC_GOOGLE_MAP_ID=...
`NOMINATIM_USER_AGENT=TripPlanner/1.0 (contact@example.com)
`SUPABASE_SERVICE_ROLE_KEY=... (local only)
`APP_URL=http://localhost:3000 (local only)
````
`
`**Vercel (prod):**
`- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
`- `GOOGLE_MAPS_SERVER_KEY` (sensitive)
`- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID` (public, browser key restricted to domain)
`- `NOMINATIM_USER_AGENT` (optional)
`
`**Never add to Vercel:** `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.
`
`---
`
`## Known Gotchas & Quirks
`
`1. **Hydration error fix:** The real fix is `TripGate` rendering from the server boot snapshot (not CaptureHost alone). See `components/trip-gate.tsx` for context.
`2. **Flight times are local.** "2026-06-18T09:40" is the local time at that airport. Layovers are exact; flight duration can't be computed.
`3. **Booking refs migration:** Old `flights.booking_ref` values are still API-readable by viewers. Run `supabase/proposals/move_booking_refs.sql` to move them to the owner-only table (not automatic; needs approval).
`4. **Vitest from PowerShell only.** Git Bash has issues; use PowerShell for `npm test` and e2e runs.
`5. **Google Places not verified live.** E2e blanks Google keys; real data like `openNow` is assumed but not tested against live Google.
`6. **Storage delete needs flag.** Real Postgres blocks direct deletes on `storage.objects` unless `storage.allow_delete_query` is set in tests.
`7. **RLS checks mutation tests:** The SQL suite includes DELETE cascades; mutation test baseline is taken once, then relative assertions (new deletes can't add baseline pollution).
`
`---
`
`## How to Extend
`
`### Adding a new table
`1. Create migration in `supabase/migrations/20261114000014_your_table.sql` (increment counter)
`2. Add idempotent `CREATE TABLE IF NOT EXISTS` with RLS enabled
`3. Define policies for select/insert/update/delete
`4. Add test cases to `supabase/tests/rls_check.sql`
`5. Extend `scripts/rls-check.ts` with live checks
`6. Run `npm run check:rls` to validate
`7. Update `lib/database.types.ts` if types don't auto-sync
`8. Create rollback at `supabase/rollback/rollback_000014.sql`
`
`### Adding a Google API call
`1. Verify it's within the 80% free-tier cap (already ~60% used for Places Text Search + Details)
`2. Call `reserve_api_call` RPC first to check quota
`3. Wrap the call in `/api/` endpoint (not exposed to client)
`4. Return only safe data; never forward Google error bodies (privacy)
`5. Add integration test in `e2e/`
`
`### Adding UI animations
`1. Define keyframes in `app/globals.css`
`2. Respect `prefers-reduced-motion` (no animation if set)
`3. Use CSS transitions or `AnimatedNumber` for numerical counters
`4. Test in accessibility inspector (Windows + Shift + F10 → Ease of Access)
`
`---
`
`## Phase 7: Itinerary map hero + card menu (branch revision/itinerary-map-hero) — MINIMAL VERSION BUILT AND PUSHED; TODO LIST BELOW
`
`Map becomes the page hero (pan/zoom, enlarge, stop chips, day filter); per-card upper-right menu (Edit / Mark complete / Remove from
`itinerary) replaces the Reorder and Add buttons at the top (grip handle on hover replaces Reorder mode); add control redone as one
`outlined shape that fills and stretches; days with no items are hidden, with a "Plan Day N" button after the last one.
`Mockups: **`design/mockups/itinerary-hero-redo.html`** (gitignored folder; one interactive file with Light/Night, Desktop/Phone, Map hero/enlarged,
`Days only-with-items vs all-11, card-menu and add-control state toggles, a Guides overlay for the spacing, and the proposal and open decisions
`under the frame). It replaces `phase7-map-hero.html`, `-v2` and `-v3`, which the user told us to disregard.
`The parts of it that were not asked for again (below) stay unbuilt until the user says so. Open decisions are listed at the bottom of the mockup page.
`
`**Built so far, as a deliberately minimal version (user: "make minimal changes to the existing UI, follow the colors, layout and fonts")**:
`the map is the hero background (Enlarge map pill, Directions pill), each card has the hamburger menu, and the "+" is centred on the card column
`and stays white (it does NOT follow the mockup's teal fill). **Not built:** removing the Reorder and Add buttons at the top, the hover grip,
`hiding days with no items and "Plan Day N", the teal-filling add control, stop chips and day filter on the map.
`
`**Next session TODO (user's list, 2026-11-17; details in memory `project-phase7-map-hero.md`):**
`1. Move the enlarge/shrink map button to the upper right of the hero map.
`2. Replace the header pills with the days: All days, Day N, then Drafts; place them lower in the hero; they filter the list.
`3. Animate enlarge/shrink.
`4. Smaller hero title font and no gradient when the map is enlarged; the reverse when shrunk; animate both.
`5. Hamburger becomes a kebab (vertical dots), placed inside the card; same menu items.
`6. Enlarge the photo on the left of the card (the right-hand map column is gone).
`7. Make sure a card can be viewed on click (viewers too, read-only).
`8. Do not show days that have no activity yet (dividers and day pills).
`9. Add control hover: highlight the outline's own shape (Commute rounded left only, Activity rounded right only, Rest square), not a generic squircle; keep it white.
`Keep colours, layout and fonts as they are; screenshot before and after each change.
`
`## Next Phase (Planned but Not Started)
`
`**Phase 6: Loading states when switching tabs**
`- Add a brief loading spinner/skeleton when switching between `/plan?tab=flights`, `?tab=stays`, `?tab=ideas`
`- Prevents the perception of server lag
`- Use `useTransition()` for smooth state handoff
`- Mockup required before coding (pending approval)
`
`---
`
`## Quick Commands
`
````bash
`# Local dev
`npm run dev
`
`# Test
`npm run lint                    # ESLint
`npm run typecheck              # TypeScript
`npm test                        # Vitest (from PowerShell)
`npx playwright test             # E2E (from PowerShell)
`npm run check:rls              # Live RLS check (starts/stops Docker)
`npm run check:secrets          # Verify no Google keys in bundles
`
`# Build/deploy
`npm run build
`npm run start
`
`# Database
`supabase migration up          # Apply migrations to local Docker
`supabase db execute -f ...sql  # Run SQL on prod (needs --project-ref)
````
`
`---
`
`## Files to Know
`
`| File | Purpose |
`|------|---------|
`| `components/trip-gate.tsx` | Hydration fix + role context |
`| `lib/queries/prefetch.tsx` | Prefetch logic for PPR |
`| `supabase/migrations/*.sql` | DB schema + RLS policies |
`| `supabase/tests/rls_check.sql` | 253 RLS validation checks |
`| `scripts/rls-check.ts` | Live RLS runner |
`| `e2e/fake-supabase.ts` | Mock Supabase for CI |
`| `.env.example`, `.env.local` | Environment template & local config |
`| `lib/database.types.ts` | Hand-patched types (auto-sync + manual overrides) |
`
`---
`
`## Handover Checklist for New Sessions
`
`- [ ] Read this CLAUDE.md
`- [ ] Check `git status` for uncommitted work
`- [ ] Review memory: `project-scratch-first-roadmap.md`, `project-revision-plan.md`
`- [ ] Run `npm run lint && npm run typecheck && npm test` to verify clean state
`- [ ] If database was touched, run `npm run check:rls` against Docker
`- [ ] Ask: "What's the next step?" (don't assume)
`
`---
`
`## Phase 8: Itinerary map interactions, links and activity photos (branch revision/itinerary-map-interactions, from revision/itinerary-map-hero)
`
`Built: (1) **Links**: ideas and activities take a Website and a Google Maps link (`website`, `mapsUrl` in `details` jsonb, no migration; `optionalUrl` / `optionalMapsUrl` in `lib/schemas.ts`; `stopLinks` / `withStopLinks` in `lib/itinerary.ts`; shown by `components/ui/place-links.tsx` in the idea sheet, the stop view and the map card). Editing keeps other `details` keys. (2) **Photos on activities**: **migration 17** (`20261117000017_activity_photos.sql`, rollback `supabase/rollback/rollback_000017.sql`) widens `item_images.item_table` to include `itinerary_items` and adds the cleanup trigger. The add sheet makes an id up front for its photos; closing without saving removes them. `PhotoOwner` type in `lib/drafts.ts`. (3) **Map**: `MapView` takes `refit` (frames all visible stops again when a day pill or the enlarge button is used), `onStopClick` and `selectedId`; clicking a pin (or an activity pill) opens `components/plan/map-stop-card.tsx` at the right of the map and enlarges the hero. With a day picked, a row of activity pills (time + name, scrolls sideways) sits under the day pills; not shown on All days.
`**Not verified:** migration 17 against Postgres (Docker was not running): run `npm run check:rls` (RLS checks and SQL checks for it were added) and apply 17 to production by hand. The real Google map (pin click, centring) is untested here (no key in e2e).
`**Open question for the user:** mobile "Add idea" (centre of the bottom nav, a nav item, or removed) is only an idea so far; mockup first.
`
`### Phase 8, second batch (approved mockups: `design/mockups/phase8-sheets-and-cards.html`; the earlier panel version is kept as `phase8-sheets-and-cards-v1-panels.html`)
`- **Time zones:** **migration 18** (`20261118000018_timezones.sql`, rollback `rollback_000018.sql`): `trips.timezone` (default Asia/Manila), `flights.dep_tz`, `flights.arr_tz`. `lib/timezones.ts` (zone list, `travelMinutes`, `gmtLabel`, `zoneForAirport`), `flightMinutes` in `lib/flights.ts` (typed time wins; calculated only when BOTH zones are set), `components/ui/timezone-select.tsx`, Home time zone in Settings, zone lines on the boarding pass. RLS checks for 18 are in `rls_check.sql` and `scripts/rls-check.ts`.
`- **Form groups:** `components/ui/form-group.tsx` + `.form-group` in globals.css (larger heading with icon, short 72px rule above every group after the first, no panels). Used by the activity, idea (Add place), stay, flight and expense sheets. Connector and the small pack/settings sheets are not grouped yet.
`- **Activity view:** a card click opens `StopView` (idea-sheet layout) for everyone; Edit details / Mark complete / Remove for editors. The kebab's Edit still opens the form. **Pin card** redone (`MapStopCard`: photo or category placeholder, day, time range, facts, links, Directions to the stop, View details).
`- **Stay sheet:** same grouped layout and fields as Add place (Stay), plus website and Google Maps link (in `stays.details`); it still saves to the `stays` table (a stay is a booking record, separate from a board idea, so the two are not merged).
`- Not verified: migrations 17 and 18 against Postgres (Docker was off): run `npm run check:rls`; apply 17 and 18 to production by hand.
`- **Phase 8, notes batch:** form-group separator is a thin centred rule (90% width, `--line`); idea sheet and activity view use one compact action row (Confirm / Add to itinerary / icon-only Edit and Drop or Remove); buttons ease between states and dip when pressed (`Button` + a `@layer base` rule in globals.css, off under reduced motion); places already on the itinerary show "In itinerary" and ask before being added again (`itineraryUsage` / `usageLabel` in lib/itinerary.ts, `ConfirmSheet`, also in the Add activity "Pick from your Places" list).
`
`---
`
`## Phase 9: planning flows (branch revision/phase9-planning-flows, from revision/itinerary-map-interactions)
`
`Mockup for the view/edit redo: `design/mockups/phase9-view-edit-sheets.html` (place view/edit, activity view/edit, stay view). **Awaiting the user's approval; not built.**
`
`Built: **Add idea** button is hidden on phones (lg and up only; phones add from Places; N still works). **Commute/rest may end a day** (only "first in a day" and "two of a kind side by side" remain). **Boarding pass** shows the calculated travel time under the plane; the flight sheet's override field shows it as the placeholder. **Add/Edit transfer** uses grouped sections. **Log as expense** from a booked flight/stay opens Spend's own `ExpenseSheet` (prop `source`), not a separate sheet. **Dropped ideas can be deleted** (confirm + undo, `useDeleteIdea`). **Confirm gates** (`lib/confirm-gate.ts`, `ConfirmIdeaSheet`): warnings (no price, area, votes, unbooked tickets/reservation) allow "Confirm anyway"; a stay with no check-in/out days or no trip start is blocked; a stay always asks. **Confirming a stay idea adds it to Stays** (`useConfirmIdea`; the stay's `details.ideaId` links the two). **Photos can be added while adding a place** (made-up id, removed again on cancel; `IdeaModal`). **Stays page:** the Add button is a dropdown (confirmed stay picked from ideas / plan or idea); add and edit use the Add place form (`IdeaModal` `stay` prop: no category, paste or draft pills, plus a Dates and booking group); every saved stay has a confirmed hotel idea behind it (`components/plan/stay-flow.tsx`, `lib/stay-sync.ts`). **Spend splits:** **migration 19** (`expenses.split` jsonb, rollback `rollback_000019.sql`; RLS checks added); `lib/split.ts` (equal / percent / flat amount, service charge included in the amount, shared in proportion or equally), `settleUp` uses it, `personSummary`, `OwesSummary` widget on Spend, Split group in `ExpenseSheet`.
`Not verified: migrations 17, 18 and 19 against Postgres (Docker was off); apply to production by hand. Still open: view/edit redo (needs mockup approval), activity edit layout by category, Stay view redo.
`- **Phase 9, approved mockups built** (`design/mockups/phase9-view-edit-sheets.html`): place view (`IdeaSheet`: status pill, Confirm and Add to itinerary in the row, Edit / Back to drafts / Drop / Delete in the header kebab, grouped Details and Discussion), activity view (`StopView`: When first, Mark complete + Edit, kebab for Remove and Open on the board), stay view (`StayDetail`: tiles, cancellation line, Booking group with a hidden-until-shown confirmation number, kebab for Cancel and Delete). `Sheet` has a `headerExtra` slot; `FormGroup` title/icon are optional. **Edit activity follows its category** (`lib/activity-details.ts`): linked to a place, that place's category; hand-added, from the Type chip (new "Rest & Stay"; sight is the generic layout); the category's details are the same section components the place form uses and are saved on the activity (`details.place`), not written back to the board idea. **Cards press as one piece** (`.press-card` + `data-card-open` in globals.css).
`- **Phase 9, notes batch:** status chip sits on the sheet's description line (`Sheet` `badge` prop; place view, activity view, place edit, activity edit); the action buttons are the smaller `xs` size. **Add activity picks a category first** (`components/plan/category-menu.tsx`: top Add, "Add the first activity", and the small + "Activity" each open the menu); the sheet shows it as a Category dropdown instead of Type chips (also on edit) and the Pick-from-Places list follows it.
`- **Phase 9, card batch:** migrations 17 to 19 are applied to production (user, 2026-11-17). Idea card: small `VoteMenu` (Vote / Voted · choice, colour-coded) left and `VoteCounts` (in teal, maybe amber, pass red, comments) right; bottom is Add to itinerary + Confirm place side by side, or, when already added, an "Added · Day N" chip + Add again with Confirm place full width below. The small + keeps its fan open when the category menu is dismissed.
`- **Map load rules:** `MapView` creates the Google map only once it is on screen and the tab is visible (`armed`), then keeps it; `requireContent` (Itinerary hero, Home) draws the stand-in instead while there are no stops. Each Google map creation is a billed load; the real map is still untested without a key.
`- **Invited people become travelers (2026-11-17):** **migration 20** (`20261120000020_viewer_travelers.sql`, rollback `rollback_000020.sql`): `travelers.user_id` (nullable, unique per trip) and `join_trip` adds a linked traveler when a viewer newly joins (or returns after removal); owners never. Settings > Viewers shows a "Traveler" chip, or an "Add as traveler" button for viewers who joined earlier. RLS checks for it are in `rls_check.sql` and `scripts/rls-check.ts` (**not run**: Docker was off). Apply 20 to production by hand.
`- **One shared map (2026-11-17):** `components/map/shared-map.ts` (store + detached host element), `map-view.tsx` (light: the box a screen gives the map, visibility gate, `requireContent`), `map-scene.tsx` (all Google code), `map-host.tsx` + `map-host-lazy.tsx` (mounted in `app/(app)/layout.tsx`, loads only after a screen first asks). The Google map is created once per session and moved between Home, Itinerary, Discover and the wizard; only Light/Night remounts it. **Not verified with a real key** (e2e has none): check in the browser that the map keeps its place when going Home to Itinerary and back, that it re-frames on arrival, and that the Maps load count in Google Cloud drops.
`- **Google link sync (2026-11-17):** **migration 21** (`20261121000021_sync_membership.sql`, rollback `rollback_000021.sql`): `sync_my_membership()` copies the account's email and (profile or Google identity) name into the caller's `trip_members` row and renames a placeholder "Guest" traveler. `syncGoogleProfile` (lib/supabase/client.ts) first fills `user_metadata` (full_name, avatar_url) from the Google identity, because linking Google to a guest leaves it empty; `components/google-profile-sync.tsx` runs it once per session in the app layout. Why: the Travelers chip reads `trip_members.email`, which was only set at join time (anonymous, so empty). Existing linked guests fix themselves the next time they open the app after migration 21 is applied. **Apply 21 to production by hand; RLS check not run (Docker off).**
`
`---
`
`## Security audit and cleanups (2026-11-19; branches security/audit-batch-1, chore/quick-wins, chore/simplify)
`
`- **Migration 23:** `is_admin()` needs the admin email on a verified Google identity (`auth.identities`), not just the JWT email; `join_trip` sends a returning removed member back as a viewer. **Migration 24:** fixes migrations 17/18 (activity photo inserts were refused by RLS; `trips.timezone` had no UPDATE grant). **Migration 25:** the invite link (`trips.join_token`) is owner-only: `active_trip()` / `trip_bootstrap()` return `''` for everyone else, `trips` has a column-limited SELECT grant without it, and the Realtime publication has a column list. **When you add a column to `trips`, add it to that grant and to the publication column list.** Owners read the token from `active_trip()`, never `from("trips")`.
`- **Production:** apply 23, 24 and 25 by hand. The Supabase Email provider should stay off (guests use anonymous sign-in and Google linking).
`- `npm run check:rls` is local-only now (it needs a Google identity row that only the local database lets us create); `--remote` is gone. CI (`.github/workflows/ci.yml`) runs types, lint, unit tests, build, the secrets scan and e2e; the RLS job is non-blocking until it has passed once on GitHub.
`- `app/error.tsx`, `global-error.tsx`, `not-found.tsx` exist (shared `components/gate/error-screen.tsx`). `lib/safe-next.ts` guards the sign-in return path. `fetchBootstrap(supabase)` no longer has a legacy fallback (needs migration 8).
`- **Calendar export:** `lib/ics.ts` + "Add to calendar (.ics)" in Trip tools. Activities are floating local times (all-day without a time), flights are UTC when both zones are known, stays are all-day. Booking numbers, confirmation numbers and prices are never written.
`- Still open: Sentry (needs a DSN), per-trip photo quota, DB-backed rate limits, CSP/HSTS, `select("*")` narrowing, the larger simplifications (stays vs hotel ideas, migration squash).
`- **Hardening round 2 (branch security/hardening-2):** migration 26 (300 photos per trip; `search_path` on two functions). `lib/same-origin.ts` refuses cross-site POSTs to `/api/places/*` and `/api/photos/link`. The link proxy has a hard stop (`LIMITS.totalMs + 1.5 s`); the geocode queue refuses a flood (8 waiting); limiter maps are pruned. **Headers:** HSTS, an enforced CSP (framing, plugins, base, forms) and the FULL CSP in `Content-Security-Policy-Report-Only` (`next.config.ts`): after a deploy open every screen, especially Itinerary with the map, and when the console shows no violations move those directives into the enforced header. Deliberately NOT done: database-backed rate limits (the routes are owner-only), changing editors' ability to add arbitrary https photo links, failing closed in `proxy.ts` when Supabase is unreachable (it would lock everyone out in an outage; RLS still protects the data).
`- **Audit follow-ups B:** migration 28 adds `expenses.rate` (own exchange rate; null = trip rate; `homeAmount` in `lib/calc.ts` uses it; the expense form shows it for foreign-currency expenses and warns when the trip rate is over 30 days old). Backups: `lib/backup.ts` (build/parse/CSV, pure) and `lib/backup-apply.ts` (restore into an EMPTY trip with rollback); Trip tools has "Download a backup (JSON)", "Expenses as CSV", "Restore from a backup". Backups leave out photos, votes, comments, the invite link, linked accounts and flight booking references. Indexes for votes/expenses/trip_members already existed; narrowing `select("*")` was judged not worth the type risk at this data size.
`- **Audit follow-ups C:** migration 29 moved any remaining `flights.booking_ref` values into `flight_refs` (and aborts if one cannot be copied), rewrote `_flight_refs_flag()` (it read the old column on delete) and dropped the column. Booking references now exist only in the owner-only `flight_refs` table; the Excel export reads them from there for anyone who may (owner/editor), the ICS and JSON backup never include them. The example seed's `ref` field is no longer written.
`- **Read-only share link (#21, migration 30):** `trip_shares` (owner-only table) + `create_trip_share` / `revoke_trip_share` (owner) + `shared_trip(token)` (the ONE function `anon` may call). What a link shows is fixed in `shared_trip()`: trip name/destination/dates/zone, itinerary stops (day, time, duration, name, city, type, tentative), flights (airline, number, airports, times, zones, terminal, status) and stays (hotel, city, dates). Never prices, notes, booking or confirmation numbers, seats, travelers, comments, ideas or photos. If you add a field to that JSON, add it to `lib/share.ts` (`parseShared` drops anything it does not know) and extend the "leaked a private field" SQL check. Public page: `app/share/[token]` (client-rendered with a session-less client; `/share/` is in the proxy's OPEN list). Owner controls: `components/settings/share-section.tsx`.
`- **Offline mode, read-only (#20):** the app opens without signal and shows the last loaded plan with an "You're offline" banner; changes fail at once with a plain message (mutations use `networkMode: "always"`, `errorMessage` rewrites fetch failures). Pieces: `public/sw.js` (service worker: caches `/_next/static/*` cache-first and the 8 main screens' HTML network-first, used ONLY when the network fails; `/offline.html` for an unsaved screen; bump `VERSION` to drop old caches), `components/offline/` (`sw-register` registers it in production and warms the screens every 12 h; `offline-cache` decides when the saved data is used; `offline-banner`), `lib/offline/` (`persist.ts` rules, `store.ts` IndexedDB, `clear.ts`). **Rules that must stay true:** (1) the saved data (IndexedDB `trip-planner-offline`) is NEVER merged into the query cache while online or before hydration has settled: doing so caused React hydration mismatch #418 in a real-build test (the streamed page hydrates after the first effects); (2) flight_refs, item_images, the member list and share links are never saved; (3) a saved copy is used only for the same signed-in user, within 14 days and the same deploy (`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`); (4) `signOut()` runs `clearOfflineData()` (deletes the copy, the `tp-*` caches, and blocks further saving on that page); (5) `proxy.ts` leaves `sw.js` and `offline.html` out of the gate. Playwright blocks service workers for every test except `e2e/offline.spec.ts`; that spec must also make the fake Supabase refuse connections (`goOffline`), because Playwright answers fake requests even when the browser is "offline". Not verified on a real phone or a real Safari. Photos are not available offline (their links are short-lived).
`
`- **Stays merged into hotel ideas (migration 31, 2026-11-19):** a stay IS a hotel idea that has been booked: `hotel_ideas.is_stay` plus `check_in`, `check_out`, `stay_status` (Planned/Booked/Done/Cancelled; the check also allows Idea/Maybe/Priced for old data) and `confirmation`. There is no `stays` table any more (the old rows are kept as `stays_retired`, revoked from every role, for one release; a later migration drops it). Field mapping: `hotel_ideas.room` holds the NOTES (it always did for ideas), the room text is `details.rooms`, the free-cancellation date is `details.freeUntil`. The app reads stays through `lib/stays.ts` (`Stay` has the same fields a stay row had, built by `stayFromIdea`) and `useStays()` / `useSetStayStatus()` / `useRemoveStay()` in `lib/queries/stays.ts`; they share the `hotel_ideas` query, so one fetch and one realtime stream. Booking an idea, editing a stay and "Add stay" are one write to the idea row (`stayIdeaColumns`, `bookingForConfirm` in `lib/stay-sync.ts`); the old two-table sync is gone. "Remove from Stays" clears the booking (`UNSTAY`) and keeps the idea, with an Undo; an expense logged from the stay keeps its link. **Expenses logged from a stay use `source_table = 'hotel_ideas'`** (`LoggableKind = "flights" | "hotel_ideas"`; the guard requires the idea to be booked). Backups are version 2 (no `stays`); version 1 files are converted on restore (`mergeV1Stays`, same rules as the migration). New columns on `hotel_ideas` need explicit grants (column-limited table). The example seed lists plain ideas first, then the booked stays; e2e uses `fake.stayRows()`.
`- **TripGate is one path (2026-11-19):** the access rules live in ONE pure function, `decideAccess` (`lib/access.ts`, 19 tests): from the server snapshot (`boot`) until the page has mounted, from the live queries afterwards, with one result shown by one `switch` in `components/trip-gate.tsx`. A held answer beats a failed refresh. **The ready screen remounts once when the page goes live, on purpose** (`key={mounted ? "live" : "snapshot"}`): the old gate did it by accident, and it hides hydration mismatches in screens that read live queries or time-zone data during the streamed part of hydration (found, then deliberately left hidden: Settings' time zone labels, which use `Date.now()`, and the Account card). Do not remove the key without running `npm run check:real-build` and making each screen hydration-safe. **`npm run check:real-build`** (opt-in, needs `npx supabase start`, ~3 min) builds the app for production against the local database and loads every main screen as a real owner, a viewer, a stranger and a signed-out visitor, plus an offline reload, failing on any hydration, script or CSP error. The fake-backend browser tests cannot see this class of bug (they have no server-side prefetch). Run it after touching the gate, the prefetch, the offline mode or the layout.
- **Weather on the itinerary (2026-11-19):** each dated day shows a chip (icon, high/low, rain chance; or "usually" for dates beyond the 16-day forecast, which shows what the SAME date was like last year). Source: Open-Meteo (free, no key), called ONLY by the server (`app/api/weather/route.ts` -> `lib/weather-server.ts`), so viewers' browsers never contact it and it sees only this server. What is sent: a place rounded to ~1 km and a date range (`e2e/weather.spec.ts` and `lib/weather-server.test.ts` assert nothing else goes out). The route needs a trip MEMBER (`requireMemberId`, guests included, not just being signed in: guest accounts can be created by anyone with the public key), refuses cross-site requests, validates and rounds its input, limits 60/min per user, caches an hour, and never passes the weather service's errors on. Pure rules (which dates get a forecast vs "usually", reading the service's JSON defensively, picking the destination for a day, planning requests) are in `lib/weather.ts` (27 tests); the hook is `useItineraryWeather` (`lib/queries/weather.ts`; weather is NOT saved in the offline copy); the chip is `components/plan/day-weather.tsx`. Days with no answer simply show nothing. `npm run check:real-build` calls the real service with London coordinates (never the real trip's).

- **Payment details in Settle up (migration 32, 2026-11-19):** `travelers.payment` jsonb (`{gcash?, maya?, maribank?, qrph?, other?}`, size-bounded by a check; rollback `rollback_000032.sql`). The group pays with GCash, Maya, MariBank and QR Ph, none of which has a public pay link, so Settle up shows each method under the transfer with a copy button (no outside links, no PayPal/Venmo; an earlier version had them and `parsePayment` ignores those keys). Set in the traveler sheet (Settings); every trip member can read it, so numbers only, never PINs or card numbers. Pure rules in `lib/payment.ts` (`METHODS` drives the form and the display). QR Ph is text only (no image upload yet). Excluded from backups and new-trip copies.

- **Migration 33 (2026-11-19):** drops `stays_retired` (the old stays table kept by migration 31). Irreversible: `rollback_000033.sql` only explains how to recover (pre-31 backup). There is now no `stays` table of any kind; any note above about keeping it for a release is out of date. **Apply 33 to production by hand** (the app does not read it, so order does not matter for users).

- **Bundle analysis (2026-11-19):** `npm run analyze:bundle` (`scripts/bundle-report.ts`, ~1 min, no database) prints, per screen, the gzip JavaScript loaded up front vs later, and the packages/app folders behind the up-front part (`SKIP_ANALYZE=1` rereads; optional screen name). Run it before and after adding a dependency or big component. Findings: vendor code dominates (next ~188 KB, zod ~34 KB, supabase ~50 KB, lucide ~23 KB); app code is a small share. Done: the wizard (`trip-gate.tsx`) and `IdeaModal` (board, save-place-modal) load lazily; the Stays add menu lives in `components/plan/add-stay-menu.tsx` so `StayFlow` stays lazy (**keep add-stay-menu free of imports from stay-flow.tsx**). Not done: replacing zod on the client (biggest remaining lever); dropping needless `"use client"` (little gain).

- **Plan Day buttons between days (2026-11-19):** besides the one after the last planned day, the Itinerary offers a dotted-outline "Plan Day N" for the first empty day right after a planned day when a later day is planned (`gap` entries in `itinerary.tsx`; one at a time, so day 3 appears once day 2 is planned). Hidden while reordering, for viewers and in a single-day view. Shared `PlanDayButton`.

- **TripGate remount removed (issue #35, 2026-11-19):** the `key={mounted ? "live" : "snapshot"}` on `TripShell` is gone, so each screen renders once. The two screens that relied on it were fixed: `TimezoneSelect` shows the city alone until the browser knows today's date (`useClientValue`), and the Settings Account card appears once the page is live. `check:real-build` now also loads every main screen as a viewer and passes. **Rule now:** anything only the browser knows goes through `useClientValue`, never `Date.now()` / live user data in the first render; the earlier note above about the deliberate remount is out of date. Not covered by the script: the wizard (client-only, lazy) and the board/sheets in states that need interaction.

- **Several live trips per person (issue #43, branch feat/multiple-trips, migration 34):** `my_trips()`, `trip_by_id(p_trip)`, `trip_bootstrap(p_trip)`, `new_trip(p_name, p_copy_from)`, `archive_trip` / `restore_trip`, and `start_new_trip(p_copy_setup, p_trip)`; `is_trip_owner()` now returns false (not NULL) for a non-member. **Addresses:** `/t/<trip id>/<screen>` (files under `app/(app)/t/[tripId]/` re-export the bare screens; the bare addresses `/`, `/itinerary` still work and mean "the trip joined last"). The id is read from the path (`lib/trip-path.ts`, `components/open-trip-from-url.tsx` -> `OpenTripProvider` / `useRequestedTripId` in `lib/open-trip.tsx`); query keys `qk.bootstrap(requested)` and `qk.openTrip(requested)` include it (`qk.activeTrip` is the prefix for invalidation); the server prefetch reads the id from `x-pathname`; a trip id the person is not on shows "That trip isn't available". Bare in-app links clicked inside a `/t/<id>` page are rewritten to stay in that trip (`OpenTripFromUrl` click guard; `data-bare-trip` opts out). **UI:** `components/trips/trip-switcher.tsx` (rail tile with the board counter opens a dropdown; phones get a chip on Home that opens a sheet; New trip, Archived trips with Restore); Settings > Trip tools has New trip beside "End this trip and start a new one"; opening an invite link when already on a trip asks first (a link cannot be previewed) and then opens the joined trip. **Server routes:** `requireMemberId(tripId)` checks that trip; `/api/weather` takes `trip=`. **Offline:** the saved copy already holds every trip's queries (keys include the trip id); the service worker treats `/t/<id>/<screen>` as app pages (`VERSION` v2). **Tests:** `e2e/multi-trip.spec.ts`; the fake has `extraTrips`. **Apply migration 34 to production by hand before deploying.** Not covered: opening a bare link in a new tab lands on the trip joined last; the archived-trip read-only banner is not built (an archived trip opens like any other).
