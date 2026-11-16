-- Undo 20261109000009_drafts_votes_comments.sql. Drops votes, comments, the tentative-stop columns and `decision`.
alter publication supabase_realtime drop table public.votes, public.comments;
drop function if exists public.set_my_label(uuid, text);
drop function if exists public.trip_people(uuid);
do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_decision_changed', t);
    execute format('drop trigger if exists %I on public.%I', t || '_deleted', t);
    execute format('alter table public.%I drop column if exists decision', t);
  end loop;
end $$;
drop trigger if exists itinerary_items_source_guard on public.itinerary_items;
drop function if exists public._itinerary_source_guard();
drop function if exists public._item_decision_changed();
alter table public.itinerary_items drop constraint if exists itinerary_items_source_pair;
alter table public.itinerary_items drop column if exists tentative, drop column if exists source_id, drop column if exists source_table;
alter table public.food_places drop column if exists price;
alter table public.attractions drop column if exists price;
drop table if exists public.comments;
drop table if exists public.votes;
drop function if exists public._item_decision(text, uuid);
drop function if exists public._item_in_trip(text, uuid, uuid);
