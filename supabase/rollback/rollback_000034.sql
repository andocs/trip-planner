-- Rollback for migration 34: drops the multi-trip functions and puts the one-argument start_new_trip (migration 22) back.
drop function if exists public.my_trips();
drop function if exists public.trip_bootstrap(uuid);
drop function if exists public.trip_by_id(uuid);
drop function if exists public.new_trip(text, uuid);
drop function if exists public.archive_trip(uuid);
drop function if exists public.restore_trip(uuid);
drop function if exists public.start_new_trip(boolean, uuid);

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
  if not public.is_trip_owner(old.id) then
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

revoke all on function public.start_new_trip(boolean) from public, anon;
grant execute on function public.start_new_trip(boolean) to authenticated;

create or replace function public.is_trip_owner(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.trip_role(t) = 'owner' and public.is_admin();
$$;
