-- Rollback for 20261119000019_expense_split.sql. Custom splits are dropped: every expense goes back to an equal split.
alter table public.expenses drop constraint if exists expenses_split_ok;
alter table public.expenses drop column if exists split;
