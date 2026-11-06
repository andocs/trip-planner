-- Rollback for 20261106000006_roles_cutover.sql. NOT a migration: run it by hand in the SQL editor.
-- Restores the pre-revision behaviour (every member can read and write; any member can replace the link).
-- Data is untouched; the new columns and the viewer roles stay, so you can cut over again later.
-- Note: viewers revoked since the cutover (revoked_at set) regain access under the old policies.
-- Run this block as one script. To also forget those revocations: update public.trip_members set revoked_at = null;

begin;

drop policy if exists trips_select on public.trips;
drop policy if exists trips_update on public.trips;
drop policy if exists trip_members_select on public.trip_members;
create policy trips_select on public.trips for select to authenticated using (public.is_trip_member(id));
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_member(id) and archived_at is null)
  with check (public.is_trip_member(id));
create policy trip_members_select on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

do $$
declare t text;
begin
  foreach t in array array['travelers', 'destinations', 'categories', 'expenses', 'itinerary_items', 'flights',
    'transfers', 'stays', 'hotel_ideas', 'food_places', 'menu_items', 'attractions', 'packing_items', 'gifts', 'reminders'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id))',
      t || '_member_all', t);
  end loop;
end $$;

create or replace function public.active_trip()
returns setof public.trips language sql security definer stable set search_path = public as $$
  select t.* from public.trips t join public.trip_members m on m.trip_id = t.id
  where m.user_id = auth.uid() and t.archived_at is null
  order by m.joined_at desc, t.created_at desc limit 1;
$$;

create or replace function public.create_trip(p_name text default 'My Trip')
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); new_id uuid;
begin
  insert into public.trips (name) values (coalesce(nullif(trim(p_name), ''), 'My Trip')) returning id into new_id;
  insert into public.trip_members (trip_id, user_id) values (new_id, uid);
  perform public._insert_default_categories(new_id);
  return new_id;
end $$;

create or replace function public.join_trip(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); t_id uuid;
begin
  select id into t_id from public.trips where join_token = p_token and archived_at is null;
  if t_id is null then raise exception 'Invite link is invalid or has expired' using errcode = 'P0002'; end if;
  insert into public.trip_members (trip_id, user_id) values (t_id, uid)
  on conflict (trip_id, user_id) do update set joined_at = now();
  return t_id;
end $$;

create or replace function public.regenerate_join_token(p_trip uuid)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  perform public._require_user();
  if not public.is_trip_member(p_trip) then raise exception 'Not a member of this trip' using errcode = '42501'; end if;
  update public.trips set join_token = encode(extensions.gen_random_bytes(12), 'hex')
   where id = p_trip and archived_at is null returning join_token into tok;
  if tok is null then raise exception 'Trip is archived' using errcode = 'P0002'; end if;
  return tok;
end $$;

create or replace function public.start_new_trip(p_copy_setup boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); old public.trips; new_id uuid; old_token text;
begin
  select * into old from public.active_trip();
  if old.id is null then return public.create_trip(); end if;
  old_token := old.join_token;
  update public.trips set archived_at = now(), join_token = encode(extensions.gen_random_bytes(12), 'hex') where id = old.id;
  insert into public.trips (join_token, home_currency, foreign_currency, rate, map_region)
  values (old_token,
    case when p_copy_setup then old.home_currency else 'PHP' end,
    case when p_copy_setup then old.foreign_currency else 'USD' end,
    case when p_copy_setup then old.rate else 1 end,
    case when p_copy_setup then old.map_region else 'world' end)
  returning id into new_id;
  insert into public.trip_members (trip_id, user_id) select new_id, m.user_id from public.trip_members m where m.trip_id = old.id;
  perform public._insert_default_categories(new_id);
  if p_copy_setup then
    insert into public.travelers (trip_id, name, sort) select new_id, name, sort from public.travelers where trip_id = old.id;
  end if;
  return new_id;
end $$;

drop function if exists public.regenerate_invite(uuid);
drop function if exists public.revoke_viewer(uuid, uuid);
drop function if exists public.claimable_trips();
drop function if exists public.claim_trip(uuid);

commit;
