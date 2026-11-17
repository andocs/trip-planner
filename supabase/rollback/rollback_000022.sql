-- Rollback for 20261122000022_editor_role.sql. Restores the can_edit-based admin checks and viewer-only carry-over.
-- Any people already promoted to editor keep that role (the column is untouched); they simply regain the old reach.
drop function if exists public.set_member_role(uuid, uuid, text);

drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members for select to authenticated
  using (user_id = auth.uid() or public.can_edit(trip_id));

create or replace function public.regenerate_invite(p_trip uuid)
returns text language plpgsql security definer set search_path = public as $$
declare tok text; ts timestamptz := clock_timestamp();
begin
  perform public._require_user();
  if not public.can_edit(p_trip) then
    raise exception 'Only the trip owner can replace the invite link' using errcode = '42501';
  end if;
  update public.trips
     set join_token = encode(extensions.gen_random_bytes(12), 'hex'), invite_rotated_at = ts
   where id = p_trip and archived_at is null
  returning join_token into tok;
  if tok is null then raise exception 'Trip is archived' using errcode = 'P0002'; end if;
  update public.trip_members set revoked_at = ts where trip_id = p_trip and role = 'viewer' and revoked_at is null;
  return tok;
end $$;

create or replace function public.revoke_viewer(p_trip uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_user();
  if not public.can_edit(p_trip) then
    raise exception 'Only the trip owner can remove viewers' using errcode = '42501';
  end if;
  update public.trip_members set revoked_at = clock_timestamp()
   where trip_id = p_trip and user_id = p_user and role = 'viewer' and revoked_at is null;
end $$;

-- start_new_trip: re-run the definition in 20261107000007_onboarding.sql to restore the viewer-only carry-over.

drop function if exists public.is_trip_owner(uuid);
