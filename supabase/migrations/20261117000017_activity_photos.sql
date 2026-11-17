-- Phase 8: photos on itinerary activities. Additive and idempotent. Rollback: supabase/rollback/rollback_000017.sql.
--
-- item_images already holds the photos of a draft (hotel_ideas, food_places, attractions). An activity added by hand on the
-- itinerary has no draft behind it, so its photos live in the same table with item_table = 'itinerary_items'.
-- Nothing else changes: the same row shape rules, the same policies (viewers read, owner and editors write), the same
-- 12-photo limit and storage rules.
--
-- 1. Widen the item_table check.
-- 2. Remove the photo rows when the activity is deleted (the pair is polymorphic, so there is no foreign key).

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.item_images'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%item_table%' and conname <> 'item_images_shape'
  loop
    execute format('alter table public.item_images drop constraint %I', c);
  end loop;
end $$;

alter table public.item_images drop constraint if exists item_images_item_table_ok;
alter table public.item_images
  add constraint item_images_item_table_ok check (item_table in ('hotel_ideas', 'food_places', 'attractions', 'itinerary_items'));

drop trigger if exists itinerary_items_item_images_cleanup on public.itinerary_items;
create trigger itinerary_items_item_images_cleanup after delete on public.itinerary_items
  for each row execute function public._item_images_cleanup();
