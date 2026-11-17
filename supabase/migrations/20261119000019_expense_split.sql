-- Phase 9: who shares an expense, and how. Additive and idempotent. Rollback: supabase/rollback/rollback_000019.sql.
--
-- expenses.split: null means "split equally between everyone" (what every existing expense does, so nothing changes for
-- them). Otherwise a small JSON object: the mode (equal | percent | amount), the people and their shares, and an optional
-- service charge that is included in the amount (see lib/split.ts for the exact shape and how it is worked out).
-- The app validates it when saving; the database only keeps it a small object. No policy changes: the existing expenses
-- policies already decide who may write it.

alter table public.expenses add column if not exists split jsonb;
alter table public.expenses drop constraint if exists expenses_split_ok;
alter table public.expenses
  add constraint expenses_split_ok check (split is null or (jsonb_typeof(split) = 'object' and pg_column_size(split) <= 4096));
