-- One round trip for what the app needs before it can draw anything: who the caller is, their active
-- trip, whether they are the admin, and their role on that trip. Replaces four sequential calls
-- (getClaims + active_trip + is_admin + trip_role). Additive: no table or policy changes, and the
-- existing functions are untouched (the app falls back to them if this one is missing).
--
-- security invoker: it only composes the existing functions, so it grants nothing they don't.
-- Rollback: drop function public.trip_bootstrap();

create or replace function public.trip_bootstrap()
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
  select * into t from public.active_trip() limit 1;
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

revoke all on function public.trip_bootstrap() from public, anon;
grant execute on function public.trip_bootstrap() to authenticated;
