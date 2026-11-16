# Trip Planner — Project Handover Guide

**Project:** A Next.js 16 trip planning app (scratch-first: drafts/voting → planning → real booking). Live at Vercel, Supabase backend (Singapore region), Google Maps integration.

**User:** Trip planner owner. Scratch-first approach: stop and report at each phase end; never start the next phase without explicit approval.

---

## Current Status (2026-11-16)

**All 5 phases complete and built (uncommitted).** Ready for deployment.

| Phase | Focus | Status | Tests |
|-------|-------|--------|-------|
| 1 | Tab delay fix (PPR cache) | ✅ Done | Pass |
| 2 | Drafts, voting, comments | ✅ Done | Pass |
| 3 | Google Places + caching | ✅ Done | Pass |
| 4 | Photos on ideas | ✅ Done | Pass |
| 5 | Boarding-pass flights | ✅ Done | Pass |

**Migrations:** 1–13 applied to prod Supabase (Singapore). Local Docker has 1–13. Booking refs moved from `flights.booking_ref` (viewer-readable) to owner-only `flight_refs` table.

**Test results:**
- TypeScript: clean
- ESLint: clean
- Unit tests: 192 pass
- Playwright e2e: 69 pass / 8 skipped (Google key tests)
- Live RLS check: 95 checks pass
- SQL suite: 253 checks pass

---

## Revision: Places / Stays / shared modal / itinerary (branch revision/places-stays-nav)

Brief: merge the Plan tabs into Places, one add/edit modal per category, Stays redesign, dashboard reminders, and the
itinerary rebuilt as mockup variant J (a card per place, drag-and-drop, commute and buffer connectors, day totals).
Mockups live in `design/mockups/revision.html` (variants A to J; J is the chosen one; the folder is gitignored).

- **Routes:** `/itinerary`, `/flights`, `/stays`, `/places` (Board + Discover; `?cat=stay|food|sight`). Old `/plan` and `?tab=`
  links redirect in `proxy.ts` via `lib/legacy-routes.ts`. Phones: five tabs + More (Spend, Pack, Settings).
- **Migrations 15 and 16** (additive, with rollbacks in `supabase/rollback/`): 15 = `details jsonb` on hotel_ideas, food_places, attractions, stays
  and `deal_breaker` on the idea tables; 16 = `position`, `kind` (stop | commute | buffer) and `details` on itinerary_items, plus a position backfill.
  Both applied to local Docker. Production: 15 and 16 need the user to run them (no CLI link or login from here).
- **Shared modal:** `components/ideas/idea-modal.tsx`; pure logic in `lib/idea-details.ts` and `lib/idea-form.ts`.
  No booking-reference field on ideas (viewers can read them); flights use `flight_refs`.
- **Add/edit anatomy:** every form uses `components/ui/form-footer.tsx` ([Delete] [Cancel] [Add or Save], "Keep adding" above the buttons;
  `RowSheet` and the idea modal both use it). The primary label is "Add" (adding) or "Save" (editing); draft or confirmed is the Status field.
  "Keep adding" is on by default for places and expenses. The add sheet (button, N, Discover's "add by hand") is the idea modal with
  **One place | Paste a list** (`components/ideas/paste-list.tsx`; opened from anywhere by `components/board/add-place.tsx`).
  A save from Discover always closes. The old separate "Add ideas" sheet is gone.
- **Itinerary:** pure rules in `lib/itinerary.ts` (order, connector rules, `planMove`, `planInsert`, day totals, stay marks, `LONG_DAY_MINUTES`)
  and `lib/itinerary-rows.ts`. UI in `components/plan/itinerary*.tsx`, `connector-sheet.tsx`. @dnd-kit does the dragging (Reorder mode, owner/editor only).
  **The day number is the source of truth:** a day's date is derived from the trip start and written to `on_date` on save; there is no date input.
  Connectors are rows with `kind <> 'stop'`; `solidStops` (calc.ts) excludes them from every counter and the export.
  Stays appear on their check-in / check-out days from the Stays page (not stored). On a wide screen (1024px up) the route map sits in a right-hand column beside the list (one Google map load per visit, as in the mockup); on a phone or tablet it only mounts when the Map pill is pressed.
  Under each activity, `components/plan/add-here.tsx` is a 44px circle (shown on hover of the card's bottom edge, always on touch) that opens into
  **Commute | Rest | Activity**; Activity inserts at that spot (`planInsert`). Not offered next to a commute or rest, in Reorder mode, or to viewers.
- **Home reminders:** `lib/reminders.ts` + `components/home/reminders-card.tsx`; dismissals live in localStorage.
- Checks at last run: live RLS 107, SQL suite 267, unit 258, e2e 96 passed / 8 skipped (RLS numbers unchanged: no database changes since).

## Architecture Overview

### Tech Stack
- **Frontend:** Next.js 16 (App Router, PPR, Suspense)
- **Database:** Supabase PostgreSQL (Singapore, ap-southeast-1)
- **Auth:** Supabase Auth (magic link for guests; Google for admin)
- **State:** TanStack Query + HydrationBoundary (hydration fix via boot snapshot)
- **UI:** React, Tailwind 4, shadcn/ui, Lucide icons
- **Maps:** Google Maps JS (@vis.gl/react-google-maps, replaces MapLibre)
- **Storage:** Supabase Storage (trip-photos bucket, 900 MB cap = 90% of free 1 GB)
- **E2E:** Playwright (fake Supabase mock for CI)
- **Testing:** Vitest (unit), PGlite + real Postgres (SQL/RLS)

### Key Files
- `app/(app)/` — main app routes (plan, places, pack, spend, settings)
- `lib/queries/` — TanStack Query hooks (trips, flights, expenses, etc.)
- `lib/supabase/client.ts` — Supabase client, RLS enforcement
- `components/trip-gate.tsx` — hydration fix; wraps app with boot snapshot
- `components/plan/` — flights (boarding-pass.tsx), stays, itinerary, transfers
- `components/places/` — Discover tab (Google Places search + caching)
- `lib/database.types.ts` — hand-patched type overrides for new columns
- `supabase/migrations/` — 13 idempotent migrations (additive only)
- `supabase/tests/rls_check.sql` — 253 RLS + mutation checks
- `scripts/rls-check.ts` — live RLS check against any Supabase instance

---

## Phase Breakdown

### Phase 1: Tab Delay (2026-11-06)
**Problem:** Switching tabs in `/plan` was slow (UI lock on first render).
**Solution:** PPR + React 19 cache + `preload()` to prefetch queries before the tab renders.
**Files:** `lib/queries/prefetch.tsx`, `components/screens/home.tsx` (useTransition), sheet navigation.
**Result:** Tabs now switch instantly.

### Phase 2: Drafts, Voting, Comments (2026-11-06)
**Focus:** Scratchpad-first: ideas (attractions, restaurants) with statuses (Idea → Maybe → Confirmed → Dropped).
**DB:** `attractions`, `restaurants`, `votes`, `comments`, `idea_notifications` (migrations 2–5).
**Features:**
- Quick-add button (N key) in Board view for capturing ideas
- Vote bars showing confidence
- Comments with real-time updates
- Itinerary groups ideas into days (Day 1, Day 2, etc.)
**RLS:** Ideas are trip-wide; viewers can vote/comment but not change status.
**Files:** `components/board/`, `components/screens/home.tsx`, `lib/calc.ts` (decision logic).

### Phase 3: Google Places (2026-11-07 to 2026-11-10)
**Focus:** Auto-suggest attractions/restaurants from Google Places, with cost cap (80% of free tier).
**DB:** `place_refs` (Place ID + 30-day cached coords + Wikimedia photo metadata). Migration 10.
**API Endpoints:**
- `/api/places/search` — Text Search
- `/api/places/details` — details (rating, hours, formatted address)
- `/api/places/photo` — og:image fetch (SSRF-hardened link proxy)
- `/api/places/image` — resize/sign storage URLs
**Rate Limit:** `reserve_api_call` RPC caps at 80% of free tier, fails closed.
**Quirk:** Real Google data (openNow, regularOpeningHours) not verified in local e2e (blanked keys).
**Files:** `app/api/places/`, `lib/cache.ts` (30-day TTL), `/app/(app)/places/page.tsx` (Discover tab).

### Phase 4: Photos (2026-11-11 to 2026-11-16)
**Focus:** Add photos to any idea (attraction, restaurant, etc.). Private bucket with 900 MB cap.
**DB:** `item_images` (replaces place_refs photo columns). Migration 11.
**Storage:** `trip-photos` bucket (owner uploads, viewers see signed URLs).
**Features:**
- Gallery grid with cover photo selector
- Resize to 1280 px client-side before upload
- Signed URLs expire after 60 min (viewers can't share permanent links)
- Orphan cleanup script (`scripts/photo-orphans.ts`)
**RLS:** Viewers can see photos (via signed URL) but not upload/delete.
**Files:** `components/photos/`, `/app/(app)/places/page.tsx` (gallery), `app/api/photos/link.ts`.

### Phase 5: Boarding-Pass Flights (2026-11-16)
**Focus:** Each flight is a boarding pass: airline, codes, times, terminal/gate/seat, booking ref, fare.
**DB:**
- `flights` columns added: `terminal`, `gate`, `seat`, `duration_min` (nullable), `has_ref` flag. Migration 13.
- `flight_refs` — new owner-only table for booking references (PNR). Migration 13.
- `expenses` — added `source_table`, `source_id` (one expense per flight/stay). Migration 12.
**Features:**
- Boarding-pass UI with perforation notch, board numerals (date), layover pills for connections
- Flight time only shown if owner types it (can't compute from local times)
- Next-day landing shows "+1"
- Booking reference hidden from viewers (shows "••••••" with lock icon)
- Log as expense button (Booked/Done only) with planned budget tracking
- Planned budget counter (Budget / Planned / Spent / Left)
- Flip animation on numbers (reduced-motion safe), pop-in on Log
**RLS:**
- Viewers cannot read `flight_refs` (booking refs stay private)
- `flights.has_ref` flag tells viewers a ref exists (without showing it)
- Old `flights.booking_ref` values left untouched; use `supabase/proposals/move_booking_refs.sql` to migrate (not run automatically)
**Files:** `components/plan/boarding-pass.tsx`, `components/plan/flights.tsx`, `components/plan/flight-sheets.tsx` (edit form), `lib/flights.ts` (helpers), `components/ui/board.tsx`, `components/ui/animated-number.tsx`.

---

## Standing Rules (Never Break These)

1. **Stop at phase end.** Report status; wait for approval before the next phase.
2. **No rewrites or backfills** without SQL shown and approval. All DB changes are additive migrations in `supabase/migrations/`.
3. **RLS is security.** Extend `scripts/rls-check.ts` for every new table/policy; run `npm run check:rls` before finishing.
4. **Secrets never printed.** Never read, log, or print `.env.local` or Vercel env vars. User adds them.
5. **Server keys stay server-only.** `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_MAPS_SERVER_KEY` never get `NEXT_PUBLIC_` prefix.
6. **Quality gate.** Each phase ends with: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx playwright test` (all pass).
7. **No commits unless asked.** All work uncommitted until user says so.
8. **Design mockups first** (Phases 2, 4, 5). Mockups must be approved in `design/mockups/` before coding. Light + night theme, AA contrast, 44 px targets, no emoji icons, reduced-motion safe.

---

## Current Env Setup

**.env.local** (local dev):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-singapore-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
NEXT_PUBLIC_GOOGLE_MAP_ID=...
NOMINATIM_USER_AGENT=TripPlanner/1.0 (contact@example.com)
SUPABASE_SERVICE_ROLE_KEY=... (local only)
APP_URL=http://localhost:3000 (local only)
```

**Vercel (prod):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
- `GOOGLE_MAPS_SERVER_KEY` (sensitive)
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID` (public, browser key restricted to domain)
- `NOMINATIM_USER_AGENT` (optional)

**Never add to Vercel:** `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

---

## Known Gotchas & Quirks

1. **Hydration error fix:** The real fix is `TripGate` rendering from the server boot snapshot (not CaptureHost alone). See `components/trip-gate.tsx` for context.
2. **Flight times are local.** "2026-06-18T09:40" is the local time at that airport. Layovers are exact; flight duration can't be computed.
3. **Booking refs migration:** Old `flights.booking_ref` values are still API-readable by viewers. Run `supabase/proposals/move_booking_refs.sql` to move them to the owner-only table (not automatic; needs approval).
4. **Vitest from PowerShell only.** Git Bash has issues; use PowerShell for `npm test` and e2e runs.
5. **Google Places not verified live.** E2e blanks Google keys; real data like `openNow` is assumed but not tested against live Google.
6. **Storage delete needs flag.** Real Postgres blocks direct deletes on `storage.objects` unless `storage.allow_delete_query` is set in tests.
7. **RLS checks mutation tests:** The SQL suite includes DELETE cascades; mutation test baseline is taken once, then relative assertions (new deletes can't add baseline pollution).

---

## How to Extend

### Adding a new table
1. Create migration in `supabase/migrations/20261114000014_your_table.sql` (increment counter)
2. Add idempotent `CREATE TABLE IF NOT EXISTS` with RLS enabled
3. Define policies for select/insert/update/delete
4. Add test cases to `supabase/tests/rls_check.sql`
5. Extend `scripts/rls-check.ts` with live checks
6. Run `npm run check:rls` to validate
7. Update `lib/database.types.ts` if types don't auto-sync
8. Create rollback at `supabase/rollback/rollback_000014.sql`

### Adding a Google API call
1. Verify it's within the 80% free-tier cap (already ~60% used for Places Text Search + Details)
2. Call `reserve_api_call` RPC first to check quota
3. Wrap the call in `/api/` endpoint (not exposed to client)
4. Return only safe data; never forward Google error bodies (privacy)
5. Add integration test in `e2e/`

### Adding UI animations
1. Define keyframes in `app/globals.css`
2. Respect `prefers-reduced-motion` (no animation if set)
3. Use CSS transitions or `AnimatedNumber` for numerical counters
4. Test in accessibility inspector (Windows + Shift + F10 → Ease of Access)

---

## Next Phase (Planned but Not Started)

**Phase 6: Loading states when switching tabs**
- Add a brief loading spinner/skeleton when switching between `/plan?tab=flights`, `?tab=stays`, `?tab=ideas`
- Prevents the perception of server lag
- Use `useTransition()` for smooth state handoff
- Mockup required before coding (pending approval)

---

## Quick Commands

```bash
# Local dev
npm run dev

# Test
npm run lint                    # ESLint
npm run typecheck              # TypeScript
npm test                        # Vitest (from PowerShell)
npx playwright test             # E2E (from PowerShell)
npm run check:rls              # Live RLS check (starts/stops Docker)
npm run check:secrets          # Verify no Google keys in bundles

# Build/deploy
npm run build
npm run start

# Database
supabase migration up          # Apply migrations to local Docker
supabase db execute -f ...sql  # Run SQL on prod (needs --project-ref)
```

---

## Files to Know

| File | Purpose |
|------|---------|
| `components/trip-gate.tsx` | Hydration fix + role context |
| `lib/queries/prefetch.tsx` | Prefetch logic for PPR |
| `supabase/migrations/*.sql` | DB schema + RLS policies |
| `supabase/tests/rls_check.sql` | 253 RLS validation checks |
| `scripts/rls-check.ts` | Live RLS runner |
| `e2e/fake-supabase.ts` | Mock Supabase for CI |
| `.env.example`, `.env.local` | Environment template & local config |
| `lib/database.types.ts` | Hand-patched types (auto-sync + manual overrides) |

---

## Handover Checklist for New Sessions

- [ ] Read this CLAUDE.md
- [ ] Check `git status` for uncommitted work
- [ ] Review memory: `project-scratch-first-roadmap.md`, `project-revision-plan.md`
- [ ] Run `npm run lint && npm run typecheck && npm test` to verify clean state
- [ ] If database was touched, run `npm run check:rls` against Docker
- [ ] Ask: "What's the next step?" (don't assume)
