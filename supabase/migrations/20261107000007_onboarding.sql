-- Onboarding wizard: new trips start as drafts that the owner fills in step by step, on any device.
-- Replaces three functions (create_trip, active_trip, start_new_trip) and adds save_onboarding and
-- finish_onboarding. No table changes (status / onboarding_step arrived in migration 5).
-- Rollback: re-run the matching functions from 20261106000006_roles_cutover.sql.

-- Drafts are visible to every member of the trip; the app shows viewers a "still being set up" screen
-- instead of the half-filled draft, and only editors get the wizard.
create or replace function public.active_trip()
returns setof public.trips
language sql
security definer
stable
set search_path = public
as $$
  select t.*
  from public.trips t
  join public.trip_members m on m.trip_id = t.id
  where m.user_id = auth.uid() and m.revoked_at is null and t.archived_at is null
  order by m.joined_at desc, t.created_at desc
  limit 1;
$$;

-- Admin only. Returns the owner's existing draft if there is one; otherwise starts a new draft.
create or replace function public.create_trip(p_name text default 'My Trip')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the trip owner can create trips' using errcode = '42501';
  end if;
  select id into new_id from public.trips
   where owner_id = uid and status = 'draft' and archived_at is null limit 1;
  if new_id is not null then return new_id; end if;

  insert into public.trips (name, owner_id, status, onboarding_step)
  values (coalesce(nullif(trim(p_name), ''), 'My Trip'), uid, 'draft', 1) returning id into new_id;
  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (new_id, uid, 'owner', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name');
  perform public._insert_default_categories(new_id);
  return new_id;
end $$;

-- Saves the wizard's answers to a DRAFT trip. `p_patch` holds only the keys the step changed:
--   name, destination, start_date, end_date, home_currency, foreign_currency, rate, rate_date, budget,
--   map_region, stops [{city, country, nights, lat, lng}], travelers ["name", ...]
-- stops / travelers replace the draft's rows wholesale (safe: a draft holds nothing else).
create or replace function public.save_onboarding(p_trip uuid, p_step int, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips;
begin
  perform public._require_user();
  select * into t from public.trips where id = p_trip;
  if t.id is null or not public.can_edit(p_trip) then
    raise exception 'Only the trip owner can set up a trip' using errcode = '42501';
  end if;
  if t.status <> 'draft' then
    raise exception 'This trip is already set up' using errcode = 'P0001';
  end if;

  update public.trips set
    name = case when p_patch ? 'name' then coalesce(nullif(trim(p_patch ->> 'name'), ''), name) else name end,
    destination = case when p_patch ? 'destination' then nullif(trim(p_patch ->> 'destination'), '') else destination end,
    start_date = case when p_patch ? 'start_date' then nullif(p_patch ->> 'start_date', '')::date else start_date end,
    end_date = case when p_patch ? 'end_date' then nullif(p_patch ->> 'end_date', '')::date else end_date end,
    home_currency = case when p_patch ? 'home_currency' then upper(p_patch ->> 'home_currency') else home_currency end,
    foreign_currency = case when p_patch ? 'foreign_currency' then upper(p_patch ->> 'foreign_currency') else foreign_currency end,
    rate = case when p_patch ? 'rate' then (p_patch ->> 'rate')::numeric else rate end,
    rate_date = case when p_patch ? 'rate_date' then nullif(p_patch ->> 'rate_date', '')::date else rate_date end,
    budget = case when p_patch ? 'budget' then coalesce((p_patch ->> 'budget')::numeric, 0) else budget end,
    map_region = case when p_patch ? 'map_region' then coalesce(nullif(p_patch ->> 'map_region', ''), 'world') else map_region end,
    onboarding_step = greatest(1, least(6, coalesce(p_step, onboarding_step)))
  where id = p_trip;

  if p_patch ? 'stops' then
    delete from public.destinations where trip_id = p_trip;
    insert into public.destinations (trip_id, city, country, nights, lat, lng, sort)
    select p_trip,
           trim(s.v ->> 'city'),
           nullif(trim(s.v ->> 'country'), ''),
           coalesce((s.v ->> 'nights')::int, 0),
           nullif(s.v ->> 'lat', '')::numeric,
           nullif(s.v ->> 'lng', '')::numeric,
           s.ord - 1
    from jsonb_array_elements(p_patch -> 'stops') with ordinality as s(v, ord)
    where length(trim(coalesce(s.v ->> 'city', ''))) > 0;
  end if;

  if p_patch ? 'travelers' then
    delete from public.travelers where trip_id = p_trip;
    insert into public.travelers (trip_id, name, sort)
    select p_trip, trim(n.v #>> '{}'), n.ord - 1
    from jsonb_array_elements(p_patch -> 'travelers') with ordinality as n(v, ord)
    where length(trim(n.v #>> '{}')) > 0;
  end if;
end $$;

-- Turns the draft into the live trip. `p_starter` adds a small packing list and a pre-trip checklist.
create or replace function public.finish_onboarding(p_trip uuid, p_starter boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips;
begin
  perform public._require_user();
  select * into t from public.trips where id = p_trip;
  if t.id is null or not public.can_edit(p_trip) then
    raise exception 'Only the trip owner can finish setting up a trip' using errcode = '42501';
  end if;
  if t.status <> 'draft' then
    raise exception 'This trip is already set up' using errcode = 'P0001';
  end if;

  update public.trips set status = 'active', onboarding_step = 6 where id = p_trip;

  if p_starter then
    insert into public.packing_items (trip_id, category, item)
    select p_trip, v.cat, v.item from (values
      ('Documents', 'Passport'), ('Documents', 'Visa or e-visa printout'), ('Documents', 'Travel insurance'),
      ('Documents', 'Flight and stay confirmations'), ('Money', 'Cards and some cash'),
      ('Clothes', 'Light layers'), ('Clothes', 'Rain jacket'), ('Clothes', 'Comfortable shoes'),
      ('Electronics', 'Phone charger'), ('Electronics', 'Power bank'), ('Electronics', 'Plug adapter'),
      ('Health', 'Medicines'), ('Health', 'Sunscreen')) as v(cat, item);
    insert into public.reminders (trip_id, text)
    select p_trip, r from unnest(array[
      'Check passport validity', 'Book flights', 'Book where you are staying', 'Buy travel insurance',
      'Notify your bank about the trip', 'Download offline maps']) as r;
  end if;
end $$;

-- Archives the owner's active trip and starts a fresh DRAFT (the wizard opens). Current viewers carry
-- over and the invite link moves with them; they see "being set up" until the owner finishes.
create or replace function public.start_new_trip(p_copy_setup boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  old public.trips;
  new_id uuid;
  old_token text;
begin
  if not public.is_admin() then
    raise exception 'Only the trip owner can start a trip' using errcode = '42501';
  end if;
  select * into old from public.active_trip();
  if old.id is null then
    return public.create_trip();
  end if;
  if not public.can_edit(old.id) then
    raise exception 'Only the trip owner can start a new trip' using errcode = '42501';
  end if;

  old_token := old.join_token;
  update public.trips
     set archived_at = now(), status = 'archived', join_token = encode(extensions.gen_random_bytes(12), 'hex')
   where id = old.id;

  insert into public.trips (join_token, owner_id, status, onboarding_step, home_currency, foreign_currency, rate, map_region)
  values (
    old_token, uid, 'draft', 1,
    case when p_copy_setup then old.home_currency else 'PHP' end,
    case when p_copy_setup then old.foreign_currency else 'USD' end,
    case when p_copy_setup then old.rate else 1 end,
    case when p_copy_setup then old.map_region else 'world' end)
  returning id into new_id;

  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (new_id, uid, 'owner', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name');
  insert into public.trip_members (trip_id, user_id, role, email, label)
  select new_id, m.user_id, 'viewer', m.email, m.label
    from public.trip_members m
   where m.trip_id = old.id and m.role = 'viewer' and m.revoked_at is null;

  perform public._insert_default_categories(new_id);
  if p_copy_setup then
    insert into public.travelers (trip_id, name, sort)
    select new_id, name, sort from public.travelers where trip_id = old.id;
  end if;
  return new_id;
end $$;

revoke all on function public.save_onboarding(uuid, int, jsonb) from public, anon;
revoke all on function public.finish_onboarding(uuid, boolean) from public, anon;
grant execute on function public.save_onboarding(uuid, int, jsonb) to authenticated;
grant execute on function public.finish_onboarding(uuid, boolean) to authenticated;
