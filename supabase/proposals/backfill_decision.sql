-- PROPOSAL ONLY. Not a migration and not applied by `supabase db push`. Review before running anything.
--
-- After migration 9 every existing row is 'confirmed', which preserves today's behaviour. This optional
-- step moves old, not-yet-decided rows into the new scratch model, using the status each row already has:
--   Idea / Maybe  -> draft      (still options)
--   Cancelled     -> dropped
--   everything else (Planned, Priced, Booked, Done, or no status) stays confirmed.
-- hotel_ideas has no status column; they were always options, so the proposal is to make them drafts.
-- Say if you would rather leave them confirmed. Preview first, then run inside a transaction.

-- Preview (read-only):
select 'food_places' as t, status, count(*) from public.food_places group by status
union all select 'attractions', status, count(*) from public.attractions group by status
union all select 'hotel_ideas', null, count(*) from public.hotel_ideas;

begin;
update public.food_places  set decision = 'draft'   where status in ('Idea', 'Maybe');
update public.food_places  set decision = 'dropped' where status = 'Cancelled';
update public.attractions  set decision = 'draft'   where status in ('Idea', 'Maybe');
update public.attractions  set decision = 'dropped' where status = 'Cancelled';
update public.hotel_ideas  set decision = 'draft';
-- Check the counts, then `commit;` (or `rollback;`).
