-- Rollback for 20261128000028_expense_rate.sql. Expenses that had their own rate go back to the trip rate.
alter table public.expenses drop constraint if exists expenses_rate_ok;
alter table public.expenses drop column if exists rate;
