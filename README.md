# Trip Planner

A mobile-first app where a small group plans one trip together: budget and expenses, itinerary, flights and stays, food and sights, packing. Built with Next.js (App Router) and Supabase, deployed on Vercel.

> Work in progress. A full setup and deploy guide arrives in milestone 8.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev                  # http://localhost:3000
```

| Script              | What it does                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run lint`      | ESLint                                                                                               |
| `npm run test`      | Vitest unit tests                                                                                    |
| `npm run build`     | Production build                                                                                     |
| `npm run check:rls` | Signs in two anonymous users against your Supabase project and proves one can't see the other's trip |
| `npm run db:push`   | Applies `supabase/migrations` to the linked project (`npx supabase link` first)                      |
| `npm run db:types`  | Regenerates `lib/database.types.ts` from the linked project                                          |

## Environment variables

| Name                            | Where                | Notes                                                           |
| ------------------------------- | -------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `.env.local`, Vercel | Project URL                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, Vercel | anon / publishable key (safe in the browser; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY`     | `.env.local` only    | Optional, for `scripts/seed.ts`. Never add to Vercel.           |

## Database and security

- Migrations live in `supabase/migrations`. Run them with `npm run db:push`, or paste each file in order into Supabase → SQL Editor.
- Every table has Row Level Security. Access is granted only through `trip_members`, which only the `create_trip`, `join_trip` and `start_new_trip` functions can write.
- The invite link `/join/<token>` is the only secret. Regenerating it from Settings invalidates the old link.
- **Proof:** paste `supabase/tests/rls_check.sql` into the SQL Editor. It always rolls back and ends with `RLS CHECK PASSED (30 checks)` or a list of failures. `npm run check:rls` checks the same thing through the public API.

### Anonymous sessions

Everyone uses Supabase anonymous sign-in, so nobody needs an account. If someone clears their browser storage (or switches browser), they lose access until they open the invite link again. A later "Save my access" option will let a user attach an email (magic link) to keep their session.
