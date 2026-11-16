-- Revision: category details on ideas and stays. Additive and idempotent. Rollback: supabase/rollback/rollback_000015.sql.
--
-- 1. details jsonb on hotel_ideas, food_places, attractions and stays: the category-specific fields of the shared
--    add/edit modal (stay type, cancellation, cuisine, meal slots, entrance fee, duration, ...). One column keyed by
--    category, validated in the app with a zod schema per category, so no new tables are needed. The database only
--    guarantees "a small JSON object" so a bad client cannot store arrays, scalars or huge blobs.
-- 2. deal_breaker boolean on the three idea tables: the "Deal-breaker / must-do" flag shown on the card and in voting.
--
-- No policy changes: the existing row-level policies already decide who can read or write these tables, and new
-- columns inherit them (viewers can read, only the owner and editors can write). Existing rows get '{}' and false.

do $$
declare
  t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions', 'stays'] loop
    execute format('alter table public.%I add column if not exists details jsonb not null default %L', t, '{}');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_details_ok');
    execute format(
      'alter table public.%I add constraint %I check (jsonb_typeof(details) = ''object'' and pg_column_size(details) <= 8192)',
      t, t || '_details_ok'
    );
  end loop;

  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('alter table public.%I add column if not exists deal_breaker boolean not null default false', t);
  end loop;
end $$;
