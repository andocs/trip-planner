-- Payment handles for settle-up: how a traveler likes to be paid back.
-- Additive: one nullable jsonb column on travelers. Shape (all optional, short text):
--   { "paypal": "name", "venmo": "name", "other": "GCash 0917 123 4567" }
-- Trip members can already read every traveler row, which is the point: the person paying needs the handle.
-- The app validates the shape; this check only bounds the size so a column cannot be used to store bulk data.
alter table public.travelers add column if not exists payment jsonb;
alter table public.travelers drop constraint if exists travelers_payment_check;
alter table public.travelers add constraint travelers_payment_check
  check (payment is null or (jsonb_typeof(payment) = 'object' and length(payment::text) <= 400));
