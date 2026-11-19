-- #22: an optional exchange rate on one expense. Additive. Rollback: supabase/rollback/rollback_000028.sql
--
-- Until now every foreign-currency expense used the trip's single rate. A bill paid on day 2 and one paid on day 9
-- can be at different rates. rate = how many home-currency units one foreign unit was worth for THIS expense
-- (the same meaning as trips.rate). Null means "use the trip rate", so every existing expense is unchanged.
-- expenses has column-limited grants, so the new column is granted explicitly.

alter table public.expenses add column if not exists rate numeric(16, 8);
alter table public.expenses drop constraint if exists expenses_rate_ok;
alter table public.expenses add constraint expenses_rate_ok check (rate is null or rate > 0);

grant insert (rate), update (rate) on public.expenses to authenticated;
