-- Hotel ideas can be priced for a half-day stay (the workbook has nights = 0.5),
-- so allow tenths of a night instead of whole numbers only.
alter table public.hotel_ideas
  alter column nights type numeric(5, 1) using nights::numeric(5, 1);
