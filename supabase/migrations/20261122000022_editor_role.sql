-- Editors: invited people the owner promotes to do everything the owner does while planning
-- (places, itinerary, flights, stays, spend, packing, trip details), minus the admin side:
-- who has access and which role they hold, the invite link, starting a new trip, and the member list (emails).
-- Additive: no new table or column. The 'editor' role and can_edit() already exist (migration 5).
--   * is_trip_owner(t): the owner, while still an admin. Used for everything admin-only.
--   * set_member_role(): owner-only, viewer <-> editor.
--   * regenerate_invite() / revoke_viewer(): now owner-only (they were can_edit, which would include editors).
--     revoke_viewer also removes editors. A new invite link still cuts off viewers only; editors keep their access.
--   * trip_members_select: only the owner sees the member list; everyone sees their own row.
--   * start_new_trip(): editors carry over with their role.
-- Roll back with supabase/rollback/rollback_000022.sql.

create or replace function public.is_trip_owner(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.trip_role(t) = 'owner' and public.is_admin();
$$;
revoke all on function public.is_trip_owner(uuid) from public, anon;
grant execute on function public.is_trip_owner(uuid) to authenticated;

drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members for select to authenticated
  using (user_id = auth.uid() or public.is_trip_owner(trip_id));

create or replace function public.set_member_role(p_trip uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can change roles' using errcode = '42501';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Role must be viewer or editor' using errcode = '22023';
  end if;
  update public.trip_members set role = p_role
   where trip_id = p_trip and user_id = p_user and role in ('viewer', 'editor') and revoked_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That person is not on this trip' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.regenerate_invite(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text;
  ts timestamptz := clock_timestamp();
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can replace the invite link' using errcode = '42501';
  end if;
  update public.trips
     set join_token = encode(extensions.gen_random_bytes(12), 'hex'), invite_rotated_at = ts
   where id = p_trip and archived_at is null
  returning join_token into tok;
  if tok is null then
    raise exception 'Trip is archived' using errcode = 'P0002';
  end if;
  update public.trip_members set revoked_at = ts where trip_id = p_trip and role = 'viewer' and revoked_at is null;
  return tok;
end $$;

create or replace function public.revoke_viewer(p_trip uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can remove people' using errcode = '42501';
  end if;
  update public.trip_members set revoked_at = clock_timestamp()
   where trip_id = p_trip and user_id = p_user and role in ('viewer', 'editor') and revoked_at is null;
end $$;

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
