-- Log a booked flight or stay as an expense. Additive and safe to run more than once. Rollback: supabase/rollback/rollback_expense_source.sql.
--
-- An expense can point at the flight or stay it paid for (source_table + source_id). That one link is what stops a
-- booking from being counted twice: the app shows "Logged" instead of offering the button again, and the database
-- allows at most one expense per flight or stay. The link can only point at an item of the SAME trip. If the flight or
-- stay is deleted later, the expense stays (the money was spent) and just loses its link.
-- Nothing existing is rewritten: both new columns are null for every current expense.

alter table public.expenses add column if not exists source_table text check (source_table in ('flights', 'stays'));
alter table public.expenses add column if not exists source_id uuid;
alter table public.expenses drop constraint if exists expenses_source_pair;
alter table public.expenses add constraint expenses_source_pair check ((source_table is null) = (source_id is null));
create unique index if not exists expenses_source_uniq on public.expenses (source_table, source_id) where source_id is not null;

create or replace function public._expense_source_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  if new.source_id is null then
    return new;
  end if;
  -- checked here as well as by the CHECK constraint: a BEFORE trigger runs first
  if new.source_table is null or new.source_table not in ('flights', 'stays') then
    raise exception 'An expense can only be linked to a flight or a stay' using errcode = '23514';
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and trip_id = $2)', new.source_table)
    into ok using new.source_id, new.trip_id;
  if not coalesce(ok, false) then
    raise exception 'The linked flight or stay is not part of this trip' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists expenses_source_guard on public.expenses;
create trigger expenses_source_guard
  before insert or update of source_table, source_id, trip_id on public.expenses
  for each row execute function public._expense_source_guard();

create or replace function public._expense_source_gone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.expenses set source_table = null, source_id = null
   where source_table = tg_table_name and source_id = old.id;
  return old;
end $$;

drop trigger if exists flights_expense_source_gone on public.flights;
create trigger flights_expense_source_gone after delete on public.flights
  for each row execute function public._expense_source_gone();
drop trigger if exists stays_expense_source_gone on public.stays;
create trigger stays_expense_source_gone after delete on public.stays
  for each row execute function public._expense_source_gone();
