# PROJECT_STATE

<!-- Single source of truth. Written only by haiku-logger. Everything above END SUMMARY must stay short (about 80 lines): Sonnet and /where-am-i read only that part. -->

## 1. What we're building
trip-planner is an existing, deployed Next.js 16 + Supabase (Singapore) + Google Maps trip planning app (scratch-first: drafts/voting, itinerary with map, flights as boarding passes, stays as booked hotel ideas, spend with splits and payment details, offline read-only mode, read-only share link, weather, ICS/JSON backups). Full handover is in CLAUDE.md. Current work: multiple trips per person (issue #43).

## 2. Current phase & active slice
- **Phase:** 3 Revisions (adopted; build phase complete, all work merged to main)
- **Active slice / milestone:** #43 gap cleanup (revision). Issue #43 slices 1-6 are merged to main as PR #44 (merge commit 19e6ee1); gap cleanup approved by user, NOT committed (working tree on main)
- **Gate:** none (#43 gap cleanup approved)
- **Next action:** user says when to commit (haiku-git would branch off main first); run check:real-build after `npx supabase start` (still to run)
- **User to-do now:** (1) confirm migrations 34 and 23-33 are applied to production by hand (not confirmed in the log); (2) two uncommitted edits on main, components/plan/map-stop-card.tsx and scripts/check-real-build.ts, purpose unknown: say whether to keep or discard

## 3. Execution log
<!-- newest last: - YYYY-MM-DD HH:MM | phase/slice | what happened or was decided | sha -->
- 2026-11-19 | Phase 1 | Project state created | -
- 2026-11-19 | Phase 1 | Project adopted (existing app, orchestrator bootstrapped); phase set to 3 Revisions | -
- 2026-11-19 | Phase 3 | Issue #43 (several live trips per person, /t/[tripId] URLs) planned as 6 sequential slices; none started | -
- 2026-11-19 15:59 | slice-1 | User answered #43 Q1 (invite link adds the trip to the list, does not replace) and Q2 (explicit "Start a new trip" archives the current trip; plain "New trip" archives nothing); slice 1 building | -
- 2026-11-19 16:01 | slice-1 | Switcher mockup built (design/mockups/multi-trip-switcher.html, gitignored, not committed): Light/Night, Desktop/Phone, 5 states; awaiting approval | -
- 2026-11-19 16:05 | slice-1 | User feedback: "all good" but keep the flight-board style counter on the switcher (rail tile, phone chip, trip rows, archived rows, invite confirmation). Mockup revised (seam thinned, menu widened, captions shortened); gate re-opened for approval | -
- 2026-11-19 16:08 | slice-1 | User decision: revert to the original recommendation (rail tile, phone chip, archived and invite screens as first drawn); flight-board counter ONLY on the clickable dropdown/sheet trip rows; try other board colours. Mockup revised (revision 3): default navy + cream, "Board colours" toggle (Navy + cream, Coral + white, Teal + mint, original amber); gate re-opened | -
- 2026-11-19 16:10 | slice-1 | User decision: keep the original amber board colours; flight-board counter on the switcher button (rail tile desktop, trip chip phone), not inside dropdown/sheet rows (plain initials there); colour toggle removed. Mockup revised (revision 4); gate re-opened | -
- 2026-11-19 | slice-1 | User approved the switcher mockup (revision 4); slice 1 closed | -
- 2026-11-19 | slice-2 | Slice 2 started: migration 34 (my_trips(), trip_bootstrap(p_trip), create a trip without archiving) + rollback + RLS checks | -
- 2026-11-19 | slice-2 | Slice 2 complete (awaiting gate): migration 34 + rollback; fixed is_trip_owner() NULL for admin non-members (found by new checks); SQL suite 358, live RLS 141, tsc/eslint clean, unit 471, e2e 13 pass; not committed | -
- 2026-11-19 | slice-3 | Slice 3 complete (awaiting gate): requireMemberId(tripId) via trip_by_id, /api/weather needs trip uuid (400/401), loadExample(tripId) owner-only; unit 473, e2e 18, tsc/eslint clean, check:real-build passed; not committed | -
- 2026-11-19 | slice-3 | Ledger: no start mark existed for slice-3, so its per-slice token row is n/a (all-time figures would mislead); cumulative row updated | -
- 2026-11-19 | slice-3 | User approved slice 3; committed and pushed on feat/multiple-trips | 426d29b
- 2026-11-19 | slice-4 | Scout findings: query keys carry no trip id; trip choice is server side; service worker paths duplicated; 173 e2e page.goto calls use old paths. Slice 4 split: 4a (trip id explicit in app, no URL change, existing tests unchanged) and 4b (/t/[tripId] routing, redirects, cookie, service worker, e2e helper) | -
- 2026-11-19 | slice-4a | Slice 4a started (building); ledger slice-3 row recorded, cumulative updated, slice-4a start marked | -
- 2026-11-19 | Phase 3 | PROJECT_STATE corrected: 4a had been shown as building, but it was already built | -
- 2026-11-19 | slice-4 | Slices 4a, 4b, 5 and 6 built and pushed on feat/multiple-trips (last commit "Final commit") | db9aabf
- 2026-11-19 | slice-2 | Slice 2 approval was never recorded in the log; it is merged anyway | -
- 2026-11-19 | #43 | PR #44 (feat/multiple-trips) merged to main; origin/main matches | 19e6ee1
- 2026-11-19 | #43 | Next: two gaps (archived-trip read-only banner; bare-link new tab opens the trip joined last, not the last-used trip) | -
- 2026-11-19 | #43 | #43 gap cleanup built, awaiting gate, NOT committed (working tree on main): (a) archived trips open read-only: lib/access.ts ready() sets canEdit false when trip.archived_at; ArchivedBanner with owner-only Restore trip in components/trip-gate.tsx; ViewOnlyBanner hidden on archived trips; (b) last-trip memory: cookie tp-last-trip written by components/open-trip-from-url.tsx, proxy.ts redirects bare screen addresses to /t/<id>/<screen> (lib/last-trip.ts, pure, unit tested), '/?latest=1' forgets it and is the 'Go to my latest trip' link, signOut clears it. Tests: tsc/eslint clean, unit 483, playwright 166 pass / 8 skipped (2 new tests in e2e/multi-trip.spec.ts). check:real-build NOT run (local Supabase stopped; needs npx supabase start). Known limit: archived read-only is enforced in the app only; child-table RLS write policies do not check archived_at (needs a migration, not done). | -
- 2026-11-19 | #43 | User approved the #43 gap cleanup gate (Approve); changes still uncommitted on main, check:real-build not yet run | -

## 4. Open questions
<!-- - [ ] Q1: ...   resolved: - [x] Q1: ... -> answer -->
- [x] Q1: When you already have a trip and open an invite link, add it to your list (recommended) or replace the current trip? -> Add it to the list (does not replace the current trip)
- [x] Q2: Should "Start a new trip" stay as its own explicit action? -> Yes: "Start a new trip" archives the current trip; a plain "New trip" archives nothing

**Backlog / unverified** (not questions; check when relevant):
- Real Google map untested (no key in e2e): pin click, centring, map keeps its place across screens, Maps load count
- Offline mode untested on a real phone and Safari
- CSP: Report-Only directives to move into the enforced header once a deploy shows no console violations
- Mobile "Add idea" placement undecided (mockup first)
- Sentry needs a DSN
- zod on the client (largest remaining bundle lever)
- Phase 6 loading skeletons for tab switches (mockup not approved)

## 5. Token & usage ledger
Source: transcript (falls back to `estimate` with `~` numbers). in = fresh input + cache writes, cached = cache reads, out = output.

| Scope | Haiku in | Haiku cached | Haiku out | Sonnet in | Sonnet cached | Sonnet out | Note |
|---|---|---|---|---|---|---|---|
| **Cumulative** | 757,583 | 3,336,333 | 92,847 | 158,752 | 21,390,024 | 82,949 | |
| Phase 1 | 2,089 | 24,846 | 691 | 1,801 | 179,296 | 565 | adoption only |
| Slice 1: Switcher mockup | 199,184 | 829,930 | 19,662 | 45,116 | 4,518,351 | 24,235 | |
| Slice 2: Migration 34 | 191,923 | 982,328 | 25,556 | 54,478 | 8,382,335 | 33,410 | |
| Slice 3: Server routes take trip id | 84,266 | 499,240 | 21,717 | 10,124 | 1,302,969 | 4,302 | script row; no start mark existed for slice-3, treat as approximate |

<!-- END SUMMARY -->

---

## Slice plan
| # | Slice | Depends on | Run | Status | Branch |
|---|---|---|---|---|---|
| 1 | Switcher mockup + approval, revision 4 (issue #43) | none | sequential | approved | feat/multiple-trips |
| 2 | DB migration 34: my_trips(), trip_bootstrap(p_trip), create-trip without archiving, RLS checks | 1 | sequential | complete, merged (PR #44); approval never recorded in log | feat/multiple-trips |
| 3 | Server routes take trip id and check membership (weather, load-example; places/photos/geocode admin-only, unchanged) | 2 | sequential | approved (commit 426d29b) | feat/multiple-trips |
| 4a | Trip id explicit in the app: trip id provider, activeTrip query keyed by trip id, bootstrap by id; NO URL change; existing tests unchanged | 3 | sequential | complete, merged (PR #44, 19e6ee1) | feat/multiple-trips |
| 4b | Routing /t/[tripId]/... with redirects from old paths, last-used-trip cookie, service worker paths, e2e helper; TripGate/decideAccess by route | 4a | sequential | complete, merged (PR #44, 19e6ee1) | feat/multiple-trips |
| 5 | Trip switcher UI, new-trip flow, invite-link behaviour | 1, 4 | sequential | complete, merged (PR #44, 19e6ee1) | feat/multiple-trips |
| 6 | Offline cache and realtime keyed by trip id; real-build check with a user on two trips | 4 | sequential | complete, merged (PR #44, 19e6ee1) | feat/multiple-trips |

## Decisions & architecture
- Stack: Next.js 16 (App Router, PPR), Supabase Postgres + Auth + Storage (Singapore), TanStack Query, Tailwind 4, shadcn/ui, Google Maps JS, Vitest, Playwright, PGlite.
- Chosen design direction: minimal changes to existing UI; follow existing colours, layout and fonts; design mockups before UI work (gitignored design/mockups/).
- Key decisions:
  - Issue #43 URL scheme: trip id in the URL (/t/[tripId]/...); no limit on live trips.
  - Photo cap 300 per trip; 900 MB storage cap shared.
  - Stop at each gate; no commits or pushes unless the user asks (a merge request counts).
  - Migrations are applied to production by the user by hand, BEFORE the code that needs them is merged.
  - Never print secrets. Run tsc, eslint, npm test (PowerShell), npx playwright test, npm run check:rls (Docker) and npm run check:real-build when relevant.

## Run & verify guide (detected by Scout, kept current)
| What | Command |
|---|---|
| Install deps | npm install |
| Apply DB migrations | Local: `npx supabase start` then `npx supabase migration up`. Production: user runs by hand (no CLI link from here) |
| Seed data | Example seed in the app (load-example); e2e uses fake.stayRows() |
| Start the app | npm run dev |
| URL | http://localhost:3000 |
| Run tests | npm test and npx playwright test (run from PowerShell) |
| Lint / build | npm run lint; npx tsc --noEmit; npm run build |
| Required env vars | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, GOOGLE_MAPS_SERVER_KEY, NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY, NEXT_PUBLIC_GOOGLE_MAP_ID (local also SUPABASE_SERVICE_ROLE_KEY, APP_URL). Values never printed. |

Other checks: `npm run check:rls` (local Docker), `npm run check:real-build` (opt-in, ~3 min), `npm run analyze:bundle`. gh CLI: C:\Program Files\GitHub CLI\gh.exe.


## Slice handoffs (what the user does after each slice)
<!-- One block per slice/revision, newest first. Format defined in the orchestrate skill. -->

### Slice 3: Server routes take trip id (approved, commit 426d29b)
1. Code: branch feat/multiple-trips, uncommitted until the user says commit.
2. Install deps: none.
3. Database: no new migration; REQUIRES migration 34 already applied in production (weather membership check calls trip_by_id).
4. Config: none.
5. Start: npm run dev; open Itinerary and the weather chips still show.
6. Check: as a trip member weather chips appear; a stranger request to /api/weather?trip=<id> returns 401.
7. Known limits: UI still has one open trip at a time; local Docker supabase was stopped by check:real-build teardown (run `npx supabase start` before the next DB run).

### Slice 2: Migration 34 (complete; gate approval not recorded in log)
1. Code: branch feat/multiple-trips, uncommitted until the user says commit.
2. Install deps: none.
3. Database: apply supabase/migrations/20261203000034_multiple_trips.sql to production by hand (SQL editor). Additive, except it drops start_new_trip(boolean) and recreates it as start_new_trip(boolean, uuid), and replaces is_trip_owner (NULL fix). Existing app calls keep working. Rollback: supabase/rollback/rollback_000034.sql. Check after: `select proname from pg_proc where proname in ('my_trips','trip_by_id','new_trip','archive_trip','restore_trip')` returns 5 rows.
4. Config: none.
5. Start: npm run dev. Nothing visible changes yet.
6. Check: nothing user-visible; local checks listed in the execution log.
7. Known limits: no app code uses the new functions yet (slices 3-6).

## Assumptions, risks & sources
- Assumptions: Production status of migrations 23-34 is UNCONFIRMED (not assumed applied; user to confirm). Only open GitHub item is issue #43. Branch feat/multiple-trips has one unrelated style commit.
- Security / compliance notes: Service role key and Google server key stay server-only. Invite link (trips.join_token) is owner-only. Read-only share links expose only the fields in shared_trip(). Production migrations are applied by the user by hand.
- Token numbers come from Claude Code session transcripts; they exclude anything run outside this project directory.
