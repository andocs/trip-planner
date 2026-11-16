-- Phase 2: drafts, votes and comments. Additive. Rollback: supabase/rollback/rollback_drafts.sql.
--
-- 1. `decision` (draft | confirmed | dropped) on hotel_ideas, food_places and attractions.
--    Existing rows become 'confirmed' (a column default, not a data rewrite), so nothing that exists today
--    changes meaning. Only rows created AFTER this migration default to 'draft'. Moving old Idea / Maybe /
--    Cancelled rows to draft / dropped is a separate, optional step: supabase/proposals/backfill_decision.sql.
-- 2. votes and comments: polymorphic (item_table, item_id) with a CHECK on the allowed table names.
--    Any member (owner, editor, viewer, anonymous joiner) manages only their OWN rows, only while
--    can_view(trip) is true. Only the owner can delete other people's comments.
-- 3. itinerary_items.source_* + tentative: an itinerary stop that points at a draft. The flag is kept by
--    triggers: confirming the source makes the stop solid, dropping or deleting the source removes it.
-- 4. trip_people() and set_my_label(): names for voters without exposing emails.
--
-- Safe to run more than once (every statement is idempotent), so a run that stopped half way, or a second run in the
-- SQL editor, converges on the same result instead of failing with "already exists". It never rewrites existing rows.

-- ---------------------------------------------------------------------------
-- 1. decision
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('alter table public.%I add column if not exists decision text not null default %L', t, 'confirmed');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_decision_check');
    execute format('alter table public.%I add constraint %I check (decision in (''draft'', ''confirmed'', ''dropped''))', t, t || '_decision_check');
    execute format('alter table public.%I alter column decision set default %L', t, 'draft');
    execute format('create index if not exists %I on public.%I (trip_id, decision)', t || '_decision_idx', t);
  end loop;
end $$;

-- A price on the two tables that had none, so a draft card can show one (home currency, per person).
-- hotel_ideas already has total + nights.
alter table public.food_places add column if not exists price numeric(12, 2) check (price is null or price >= 0);
alter table public.attractions add column if not exists price numeric(12, 2) check (price is null or price >= 0);

-- ---------------------------------------------------------------------------
-- Helpers (callable by signed-in users because policies use them; they only answer yes/no)
-- ---------------------------------------------------------------------------
create or replace function public._item_in_trip(p_table text, p_id uuid, p_trip uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare ok boolean;
begin
  if p_table not in ('hotel_ideas', 'food_places', 'attractions') then return false; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and trip_id = $2)', p_table) into ok using p_id, p_trip;
  return coalesce(ok, false);
end $$;

create or replace function public._item_decision(p_table text, p_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare d text;
begin
  if p_table not in ('hotel_ideas', 'food_places', 'attractions') then return null; end if;
  execute format('select decision from public.%I where id = $1', p_table) into d using p_id;
  return d;
end $$;

revoke all on function public._item_in_trip(text, uuid, uuid) from public, anon;
revoke all on function public._item_decision(text, uuid) from public, anon;
grant execute on function public._item_in_trip(text, uuid, uuid) to authenticated;
grant execute on function public._item_decision(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. votes and comments
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  item_table text not null check (item_table in ('hotel_ideas', 'food_places', 'attractions')),
  item_id    uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value      text not null check (value in ('in', 'maybe', 'pass')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_table, item_id, user_id)
);
create index if not exists votes_trip_idx on public.votes (trip_id);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  item_table text not null check (item_table in ('hotel_ideas', 'food_places', 'attractions')),
  item_id    uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_item_idx on public.comments (item_table, item_id, created_at);
create index if not exists comments_trip_idx on public.comments (trip_id);

alter table public.votes enable row level security;
alter table public.comments enable row level security;

-- Clients may only touch the columns a member is allowed to change.
revoke all on public.votes, public.comments from anon;
revoke update on public.votes, public.comments from authenticated;
grant update (value, updated_at) on public.votes to authenticated;
grant update (body) on public.comments to authenticated;

drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes for select to authenticated using (public.can_view(trip_id));
drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_view(trip_id) and public._item_in_trip(item_table, item_id, trip_id));
drop policy if exists votes_update on public.votes;
create policy votes_update on public.votes for update to authenticated
  using (user_id = auth.uid() and public.can_view(trip_id))
  with check (user_id = auth.uid() and public.can_view(trip_id));
drop policy if exists votes_delete on public.votes;
create policy votes_delete on public.votes for delete to authenticated
  using (user_id = auth.uid() and public.can_view(trip_id));

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated using (public.can_view(trip_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_view(trip_id) and public._item_in_trip(item_table, item_id, trip_id));
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (user_id = auth.uid() and public.can_view(trip_id))
  with check (user_id = auth.uid() and public.can_view(trip_id));
-- Your own comments, or any comment if you are the trip's owner (an owner counts only while still an admin).
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (public.can_view(trip_id)
         and (user_id = auth.uid() or (public.trip_role(trip_id) = 'owner' and public.is_admin())));

-- ---------------------------------------------------------------------------
-- 3. tentative itinerary stops
-- ---------------------------------------------------------------------------
alter table public.itinerary_items
  add column if not exists source_table text check (source_table in ('hotel_ideas', 'food_places', 'attractions')),
  add column if not exists source_id uuid,
  add column if not exists tentative boolean not null default false;
alter table public.itinerary_items drop constraint if exists itinerary_items_source_pair;
alter table public.itinerary_items add constraint itinerary_items_source_pair check ((source_table is null) = (source_id is null));
create index if not exists itinerary_items_source_idx on public.itinerary_items (source_table, source_id) where source_id is not null;

create or replace function public._itinerary_source_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d text;
begin
  if new.source_id is null then
    new.tentative := false;
    return new;
  end if;
  if not public._item_in_trip(new.source_table, new.source_id, new.trip_id) then
    raise exception 'The linked idea is not part of this trip' using errcode = '23503';
  end if;
  d := public._item_decision(new.source_table, new.source_id);
  if d = 'dropped' then
    raise exception 'A dropped idea cannot be added to the itinerary' using errcode = '23514';
  end if;
  new.tentative := (d = 'draft');
  return new;
end $$;

drop trigger if exists itinerary_items_source_guard on public.itinerary_items;
create trigger itinerary_items_source_guard
  before insert or update of source_table, source_id on public.itinerary_items
  for each row execute function public._itinerary_source_guard();

-- Source changed: confirmed -> solid, draft -> dashed, dropped -> stop removed. Source deleted -> stop,
-- votes and comments removed too (there is no foreign key on a polymorphic pair).
create or replace function public._item_decision_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.itinerary_items where source_table = tg_table_name and source_id = old.id;
    delete from public.votes where item_table = tg_table_name and item_id = old.id;
    delete from public.comments where item_table = tg_table_name and item_id = old.id;
    return old;
  end if;
  if new.decision = 'dropped' then
    delete from public.itinerary_items where source_table = tg_table_name and source_id = new.id;
  else
    update public.itinerary_items set tentative = (new.decision = 'draft')
     where source_table = tg_table_name and source_id = new.id and tentative is distinct from (new.decision = 'draft');
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_decision_changed', t);
    execute format('drop trigger if exists %I on public.%I', t || '_deleted', t);
    execute format('create trigger %I after update of decision on public.%I for each row when (old.decision is distinct from new.decision) execute function public._item_decision_changed()', t || '_decision_changed', t);
    execute format('create trigger %I after delete on public.%I for each row execute function public._item_decision_changed()', t || '_deleted', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. names for voters (never emails)
-- ---------------------------------------------------------------------------
create or replace function public.trip_people(p_trip uuid)
returns table (user_id uuid, label text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.label, m.role
    from public.trip_members m
   where m.trip_id = p_trip and public.can_view(p_trip);
$$;

create or replace function public.set_my_label(p_trip uuid, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare clean text := btrim(coalesce(p_label, ''));
begin
  if char_length(clean) not between 1 and 40 then
    raise exception 'Name must be 1 to 40 characters' using errcode = '22023';
  end if;
  update public.trip_members set label = clean
   where trip_id = p_trip and user_id = auth.uid() and revoked_at is null;
  if not found then
    raise exception 'You are not a member of this trip' using errcode = '42501';
  end if;
end $$;

revoke all on function public.trip_people(uuid) from public, anon;
revoke all on function public.set_my_label(uuid, text) from public, anon;
grant execute on function public.trip_people(uuid) to authenticated;
grant execute on function public.set_my_label(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'votes') then
    alter publication supabase_realtime add table public.votes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
