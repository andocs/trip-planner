-- Revision: itinerary ordering and connector blocks. Additive and idempotent. Rollback: supabase/rollback/rollback_000016.sql.
--
-- 1. position: the order of an item within its day. A number you can slot between two others (fractional), so a
--    drag changes ONE row. The app re-spaces a day only when the gaps get too small.
-- 2. kind: 'stop' (a place, as before) or a connector between two stops: 'commute' or 'buffer'. A connector keeps
--    its label in `activity` and its length in `duration_min`, so the existing columns are reused.
-- 3. details: a connector's mode / kind, optional cost and note. The same "small JSON object" guard as migration 15.
--
-- The rules "a connector can't be first or last in a day" and "no two of the same kind side by side" are enforced
-- in the app (they depend on the order, which a row-level check can't see). No policy changes: the existing
-- itinerary_items policies already let only the owner and editors write.
--
-- Backfill (below): gives every existing item a position, in the order it was already shown (by time, untimed last,
-- then creation order), spaced 1000 apart. It touches only rows whose position is still null, so it is safe to re-run.

alter table public.itinerary_items
  add column if not exists position double precision,
  add column if not exists kind text not null default 'stop',
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.itinerary_items drop constraint if exists itinerary_items_kind_ok;
alter table public.itinerary_items
  add constraint itinerary_items_kind_ok check (kind in ('stop', 'commute', 'buffer'));

alter table public.itinerary_items drop constraint if exists itinerary_items_details_ok;
alter table public.itinerary_items
  add constraint itinerary_items_details_ok check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192);

alter table public.itinerary_items drop constraint if exists itinerary_items_position_ok;
alter table public.itinerary_items
  add constraint itinerary_items_position_ok
  check (position is null or (position > -1e15 and position < 1e15));

create index if not exists itinerary_items_order_idx on public.itinerary_items (trip_id, day, position);

with ranked as (
  select id, row_number() over (partition by trip_id, day order by at_time nulls last, created_at, id) as rn
  from public.itinerary_items
  where position is null
)
update public.itinerary_items i
   set position = r.rn * 1000
  from ranked r
 where i.id = r.id;
