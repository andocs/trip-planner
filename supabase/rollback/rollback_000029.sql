-- Rollback for 20261129000029_drop_flight_booking_ref.sql.
-- Brings the column back and copies the references back into it. NOTE: that makes them readable by viewers again.
-- The references also stay in flight_refs.
alter table public.flights add column if not exists booking_ref text;
grant insert (booking_ref), update (booking_ref) on public.flights to authenticated;
update public.flights f set booking_ref = r.booking_ref from public.flight_refs r where r.flight_id = f.id;

create or replace function public._flight_refs_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.flights set has_ref = (booking_ref is not null) where id = old.flight_id;
    return old;
  end if;
  update public.flights set has_ref = true where id = new.flight_id and has_ref is distinct from true;
  return new;
end $$;
