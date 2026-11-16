-- Undo 20261112000012_expense_source.sql. Expenses keep their amounts; only the link to a flight or stay is dropped.
drop trigger if exists flights_expense_source_gone on public.flights;
drop trigger if exists stays_expense_source_gone on public.stays;
drop trigger if exists expenses_source_guard on public.expenses;
drop function if exists public._expense_source_gone();
drop function if exists public._expense_source_guard();
drop index if exists public.expenses_source_uniq;
alter table public.expenses drop constraint if exists expenses_source_pair;
alter table public.expenses drop column if exists source_id;
alter table public.expenses drop column if exists source_table;
