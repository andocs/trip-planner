-- Trip Planner schema: one row in `trips` per trip, every other table hangs off trip_id.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  join_token       text unique not null default encode(extensions.gen_random_bytes(12), 'hex'),
  name             text not null default 'My Trip',
  destination      text,
  start_date       date,
  end_date         date,
  home_currency    text not null default 'PHP',
  foreign_currency text not null default 'USD',
  rate             numeric(18, 8) not null default 1,          -- 1 foreign = ? home
  rate_date        date,                                        -- when a live rate was last fetched
  budget           numeric(14, 2) not null default 0,
  map_region       text not null default 'world',              -- GeoChart region code
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint trips_dates_ok check (end_date is null or start_date is null or end_date >= start_date),
  constraint trips_rate_positive check (rate > 0),
  constraint trips_currency_codes check (home_currency ~ '^[A-Z]{3}$' and foreign_currency ~ '^[A-Z]{3}$')
);

-- ---------------------------------------------------------------------------
-- trip_members: who may access a trip
-- ---------------------------------------------------------------------------
create table public.trip_members (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

-- ---------------------------------------------------------------------------
-- Child tables
-- ---------------------------------------------------------------------------
create table public.travelers (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, trip_id)
);

create table public.destinations (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  city       text not null,
  country    text,
  nights     int not null default 0 check (nights >= 0),
  lat        numeric check (lat between -90 and 90),
  lng        numeric check (lng between -180 and 180),
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null,
  planned    numeric(14, 2),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, trip_id)
);

-- Composite FKs keep category/payer inside the same trip as the expense.
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  spent_on    date not null,
  description text not null,
  category_id uuid,
  paid_by     uuid,
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  amount      numeric(14, 2) not null,
  note        text,
  created_at  timestamptz not null default now(),
  foreign key (category_id, trip_id) references public.categories (id, trip_id) on delete set null (category_id),
  foreign key (paid_by, trip_id) references public.travelers (id, trip_id) on delete set null (paid_by)
);

create table public.itinerary_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  day          int,
  on_date      date,
  city         text,
  at_time      time,
  activity     text not null,
  type         text check (type in ('Transport', 'Sightseeing', 'Food & Drink', 'Rest & Stay', 'Activity', 'Shopping', 'Flight', 'Other')),
  duration_min int check (duration_min >= 0),
  note         text,
  done         boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Flight times are local wall-clock times at each airport, so no time zone.
create table public.flights (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  from_code   text,
  to_code     text,
  airline     text,
  flight_no   text,
  departs_at  timestamp,
  arrives_at  timestamp,
  fare        numeric(14, 2),
  status      text not null default 'Planned',
  booking_ref text,
  created_at  timestamptz not null default now()
);

create table public.transfers (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  route      text not null,
  provider   text,
  cost_text  text,
  link       text,
  created_at timestamptz not null default now()
);

create table public.stays (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  status       text not null default 'Planned',
  city         text,
  hotel        text not null,
  room         text,
  check_in     date,
  check_out    date,
  total        numeric(14, 2),
  confirmation text,
  note         text,
  created_at   timestamptz not null default now(),
  constraint stays_dates_ok check (check_out is null or check_in is null or check_out >= check_in)
);

create table public.hotel_ideas (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  city       text,
  hotel      text not null,
  room       text,
  nights     int check (nights >= 0),
  total      numeric(14, 2),
  created_at timestamptz not null default now()
);

create table public.food_places (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null,
  city       text,
  day        int,
  note       text,
  status     text not null default 'Planned',
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  restaurant    text not null,
  dish          text not null,
  price_foreign numeric(14, 2),
  created_at    timestamptz not null default now()
);

create table public.attractions (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null,
  city       text,
  day        int,
  note       text,
  status     text not null default 'Planned',
  created_at timestamptz not null default now()
);

create table public.packing_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  category   text,
  item       text not null,
  whose      text,
  packed     boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.gifts (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  for_whom   text not null,
  gift       text not null,
  budget     numeric(14, 2),
  bought     boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reminders (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

-- Status values shared by flights, stays, food places and attractions.
do $$
declare t text;
begin
  foreach t in array array['flights', 'stays', 'food_places', 'attractions'] loop
    execute format(
      'alter table public.%I add constraint %I check (status in (''Idea'',''Maybe'',''Planned'',''Priced'',''Booked'',''Done'',''Cancelled''))',
      t, t || '_status_check');
  end loop;
end $$;

-- trip_id indexes on every child table.
do $$
declare t text;
begin
  foreach t in array array['travelers', 'destinations', 'categories', 'expenses', 'itinerary_items', 'flights',
    'transfers', 'stays', 'hotel_ideas', 'food_places', 'menu_items', 'attractions', 'packing_items', 'gifts', 'reminders'] loop
    execute format('create index %I on public.%I (trip_id)', t || '_trip_idx', t);
  end loop;
end $$;

create index expenses_category_idx on public.expenses (category_id);
create index expenses_paid_by_idx on public.expenses (paid_by);
