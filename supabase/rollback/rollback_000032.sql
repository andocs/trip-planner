alter table public.travelers drop constraint if exists travelers_payment_check;
alter table public.travelers drop column if exists payment;
