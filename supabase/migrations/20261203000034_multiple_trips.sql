-- Several live trips per person (issue #43). Additive: new functions only, plus start_new_trip gains an optional trip id.
--   * my_trips()                    every trip I belong to (live, draft, archived), with my role. Runs as the caller, so RLS decides
--                                   what each row may show (viewers do not see drafts).
--   * trip_by_id(p_trip)            one trip by id for a member who is not revoked (archived allowed, read only in the app); the invite
--                                   link is blank unless the caller owns the trip, like active_trip().
--   * trip_bootstrap(p_trip)        the boot snapshot for THAT trip. trip = null and role = null when the caller is not a member.
--                                   The no-argument trip_bootstrap() and active_trip() stay: they mean "the trip I joined last".
--   * new_trip(p_name, p_copy_from) admin only. Always adds a trip and archives nothing. Optionally copies currencies, rate, map
--                                   region and travelers from a trip the caller owns (never members, photos or plan data).
--   * archive_trip / restore_trip   owner only. Archiving rotates the invite link (as start_new_trip does); restoring keeps the new one.
--   * start_new_trip(copy, trip)    same meaning ("end this trip and start over"), but can name the trip instead of taking the newest.
--   * is_trip_owner(t)              now returns false (not NULL) for a trip the caller is not a member of.
-- Rollback: supabase/rollback/rollback_000034.sql (puts the one-argument start_new_trip and the old is_trip_owner back).

-- Fix found while writing the checks below: trip_role() is NULL for a non-member, so is_trip_owner() returned NULL (not false) for the
-- admin on a trip they do not belong to, and "if not is_trip_owner(...)" guards let that case through. Now it is always true or false.
create or replace function public.is_trip_owner(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.trip_role(t) = 'owner', false) and public.is_admin();
$$;

create or replace function public.my_trips()
returns table (id uuid, name text, destination text, start_date date, end_date date, status text,
               archived_at timestamptz, role text, joined_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, t.name, t.destination, t.start_date, t.end_date, t.status, t.archived_at, m.role::text, m.joined_at
    from public.trip_members m
    join public.trips t on t.id = m.trip_id
   where m.user_id = auth.uid() and m.revoked_at is null
   order by (t.archived_at is not null), t.start_date nulls last, m.joined_at desc;
$$;

create or replace function public.trip_by_id(p_trip uuid)
returns setof public.trips
language plpgsql
security definer
stable
set search_path = public
as $$
declare t public.trips;
begin
  for t in
    select x.*
      from public.trips x
      join public.trip_members m on m.trip_id = x.id
     where x.id = p_trip and m.user_id = auth.uid() and m.revoked_at is null
  loop
    if not public.is_trip_owner(t.id) then t.join_token := ''; end if;
    return next t;
  end loop;
end $$;

create or replace function public.trip_bootstrap(p_trip uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t public.trips;
  r text;
begin
  if uid is null then return null; end if;
  select * into t from public.trip_by_id(p_trip) limit 1;
  if t.id is not null then r := public.trip_role(t.id); end if;
  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', uid,
      'email', auth.jwt() ->> 'email',
      'is_anonymous', coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    ),
    'trip', case when t.id is null then null else to_jsonb(t) end,
    'is_admin', public.is_admin(),
    'role', r
  );
end $$;

create or replace function public.new_trip(p_name text default 'My Trip', p_copy_from uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  src public.trips;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the trip owner can create trips' using errcode = '42501';
  end if;
  if p_copy_from is not null then
    if not public.is_trip_owner(p_copy_from) then
      raise exception 'You can only copy the setup of a trip you own' using errcode = '42501';
    end if;
    select * into src from public.trips where id = p_copy_from;
  end if;

  insert into public.trips (name, owner_id, status, onboarding_step, home_currency, foreign_currency, rate, map_region)
  values (
    coalesce(nullif(trim(p_name), ''), 'My Trip'), uid, 'draft', 1,
    coalesce(src.home_currency, 'PHP'), coalesce(src.foreign_currency, 'USD'), coalesce(src.rate, 1), coalesce(src.map_region, 'world'))
  returning id into new_id;
  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (new_id, uid, 'owner', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name');
  perform public._insert_default_categories(new_id);
  if src.id is not null then
    insert into public.travelers (trip_id, name, sort)
    select new_id, name, sort from public.travelers where trip_id = src.id;
  end if;
  return new_id;
end $$;

create or replace function public.archive_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can archive a trip' using errcode = '42501';
  end if;
  update public.trips
     set archived_at = now(), status = 'archived', join_token = encode(extensions.gen_random_bytes(12), 'hex')
   where id = p_trip and archived_at is null;
end $$;

create or replace function public.restore_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can restore a trip' using errcode = '42501';
  end if;
  update public.trips set archived_at = null, status = 'active' where id = p_trip and archived_at is not null;
end $$;

-- start_new_trip: the one-argument form is replaced by one with an optional trip id (two overloads that both default would be ambiguous).
drop function if exists public.start_new_trip(boolean);
create or replace function public.start_new_trip(p_copy_setup boolean default true, p_trip uuid default null)
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
  if p_trip is null then
    select * into old from public.active_trip();
  else
    select * into old from public.trip_by_id(p_trip);
  end if;
  if old.id is null then
    return public.create_trip();
  end if;
  if not public.is_trip_owner(old.id) then
    raise exception 'Only the trip owner can start a new trip' using errcode = '42501';
  end if;
  if old.archived_at is not null then
    raise exception 'That trip is already archived' using errcode = '22023';
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
  select new_id, m.user_id, m.role, m.email, m.label
    from public.trip_members m
   where m.trip_id = old.id and m.role in ('viewer', 'editor') and m.revoked_at is null;

  perform public._insert_default_categories(new_id);
  if p_copy_setup then
    insert into public.travelers (trip_id, name, sort)
    select new_id, name, sort from public.travelers where trip_id = old.id;
  end if;
  return new_id;
end $$;

-- Only signed-in users may call these (same as the functions they extend).
revoke all on function public.my_trips() from public, anon;
revoke all on function public.trip_by_id(uuid) from public, anon;
revoke all on function public.trip_bootstrap(uuid) from public, anon;
revoke all on function public.new_trip(text, uuid) from public, anon;
revoke all on function public.archive_trip(uuid) from public, anon;
revoke all on function public.restore_trip(uuid) from public, anon;
revoke all on function public.start_new_trip(boolean, uuid) from public, anon;
grant execute on function public.my_trips() to authenticated;
grant execute on function public.trip_by_id(uuid) to authenticated;
grant execute on function public.trip_bootstrap(uuid) to authenticated;
grant execute on function public.new_trip(text, uuid) to authenticated;
grant execute on function public.archive_trip(uuid) to authenticated;
grant execute on function public.restore_trip(uuid) to authenticated;
grant execute on function public.start_new_trip(boolean, uuid) to authenticated;
