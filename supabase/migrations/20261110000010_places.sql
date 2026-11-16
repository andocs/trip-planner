-- Phase 3: Google Places suggestions and the Google map. Additive. Rollback: supabase/rollback/rollback_places.sql.
-- Nothing here rewrites or backfills existing data.
--
-- 1. api_caps / api_usage / place_fetch_log + reserve_api_call(): a hard monthly cap per billable Google SKU
--    (80% of each free allowance) and a per-user rate limit. It FAILS CLOSED: an unknown SKU, a missing row or
--    any doubt means "no call". Only the owner (an admin) can reserve a call.
-- 2. place_refs: links a draft/idea to a Google place by place ID (kept indefinitely, as Google's terms allow),
--    and optional coordinates (kept at most 30 days: purge_stale_place_coords()). Photos live in item_images (migration 11).
--    It never stores Google names, ratings, hours, descriptions or photos.

-- ---------------------------------------------------------------------------
-- 1. Quota guard
-- ---------------------------------------------------------------------------
create table public.api_caps (
  sku            text primary key check (sku ~ '^[a-z_]{3,40}$'),
  monthly_cap    integer not null check (monthly_cap >= 0),
  free_allowance integer not null check (free_allowance >= 0),
  check (monthly_cap <= free_allowance)
);

-- 80% of the free allowance of each SKU (Google Maps Platform pricing, checked 2026-11-07).
insert into public.api_caps (sku, monthly_cap, free_allowance) values
  ('text_search_enterprise', 800, 1000),  -- Text Search with rating fields: one call returns about 20 cards
  ('details_pro', 4000, 5000),            -- Place Details with name + location + link
  ('details_enterprise', 800, 1000),      -- Place Details with opening hours (opening a place)
  ('photos', 800, 1000);                  -- Place Photos media (one call per photo)

create table public.api_usage (
  period date not null,                    -- first day of the UTC month
  sku    text not null references public.api_caps (sku),
  calls  integer not null default 0 check (calls >= 0),
  primary key (period, sku)
);

create table public.place_fetch_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  sku        text not null,
  created_at timestamptz not null default now()
);
create index place_fetch_log_user_idx on public.place_fetch_log (user_id, created_at desc);

alter table public.api_caps enable row level security;
alter table public.api_usage enable row level security;
alter table public.place_fetch_log enable row level security;

-- Clients may only READ the caps and the usage, and only if they are an admin (so the owner can see the meter).
-- Nobody can write these tables except through reserve_api_call().
revoke all on public.api_caps, public.api_usage, public.place_fetch_log from anon, authenticated;
grant select on public.api_caps, public.api_usage to authenticated;
create policy api_caps_admin_read on public.api_caps for select to authenticated using (public.is_admin());
create policy api_usage_admin_read on public.api_usage for select to authenticated using (public.is_admin());
-- place_fetch_log has no policy and no grant: it is internal.

-- Returns 'ok' (one call reserved), 'rate' (too many calls this minute) or 'cap' (the monthly cap is reached).
-- Raises 42501 for anyone who is not signed in as an admin. The cap check and the increment are one atomic
-- statement, so two requests at the same moment can never both take the last call.
create or replace function public.reserve_api_call(p_sku text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_calls integer;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Per-user rate limit: at most 30 reserved calls in any rolling minute.
  if (select count(*) from public.place_fetch_log where user_id = uid and created_at > now() - interval '1 minute') >= 30 then
    return 'rate';
  end if;

  insert into public.api_usage as u (period, sku, calls)
  select v_period, c.sku, 1 from public.api_caps c where c.sku = p_sku and c.monthly_cap >= 1
  on conflict (period, sku) do update set calls = u.calls + 1
    where u.calls < (select monthly_cap from public.api_caps where sku = u.sku)
  returning u.calls into v_calls;

  if not found then
    return 'cap';
  end if;

  insert into public.place_fetch_log (user_id, sku) values (uid, p_sku);
  delete from public.place_fetch_log where created_at < now() - interval '2 days';
  return 'ok';
end $$;

revoke all on function public.reserve_api_call(text) from public, anon;
grant execute on function public.reserve_api_call(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. place_refs
-- ---------------------------------------------------------------------------
create table public.place_refs (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  item_table        text not null check (item_table in ('hotel_ideas', 'food_places', 'attractions')),
  item_id           uuid not null,
  place_id          text not null check (place_id ~ '^[A-Za-z0-9_-]+$' and char_length(place_id) between 10 and 300),
  -- Coordinates may be cached for at most 30 days (Google Maps Platform policy). All three move together.
  lat               double precision check (lat between -90 and 90),
  lng               double precision check (lng between -180 and 180),
  coords_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (item_table, item_id),
  constraint place_refs_coords_together check ((lat is null) = (lng is null) and (lat is null) = (coords_at is null))
);
create index place_refs_trip_idx on public.place_refs (trip_id);
create index place_refs_coords_idx on public.place_refs (coords_at) where coords_at is not null;

alter table public.place_refs enable row level security;
revoke all on public.place_refs from anon;

-- Everyone who can see the trip reads the links (viewers need the Maps link).
-- Only an owner/editor writes them, and only for an idea that belongs to the same trip.
create policy place_refs_select on public.place_refs for select to authenticated using (public.can_view(trip_id));
create policy place_refs_insert on public.place_refs for insert to authenticated
  with check (public.can_edit(trip_id) and public._item_in_trip(item_table, item_id, trip_id));
create policy place_refs_update on public.place_refs for update to authenticated
  using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));
create policy place_refs_delete on public.place_refs for delete to authenticated using (public.can_edit(trip_id));

-- The link may point at a different place later, but never at a different idea or trip.
revoke update on public.place_refs from authenticated;
grant update (place_id, lat, lng, coords_at) on public.place_refs to authenticated;

-- Coordinates older than 30 days are deleted. Safe for anyone to call: it only removes stale data.
-- If pg_cron is available you can also schedule it daily; the app calls it when the owner opens Discover.
create or replace function public.purge_stale_place_coords()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.place_refs set lat = null, lng = null, coords_at = null
   where coords_at is not null and coords_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_stale_place_coords() from public, anon;
grant execute on function public.purge_stale_place_coords() to authenticated;

-- A place link has no foreign key to the idea (the pair is polymorphic), so remove it with the idea.
create or replace function public._place_refs_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.place_refs where item_table = tg_table_name and item_id = old.id;
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('create trigger %I after delete on public.%I for each row execute function public._place_refs_cleanup()', t || '_place_refs_cleanup', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.place_refs;
