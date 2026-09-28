-- Ticket types and prices for /register, edited from /admin →
-- "Tickets & prices" instead of in code.
--
-- Run this in the Supabase dashboard (SQL Editor) after
-- 20260928120000_registration_form.sql and before deploying. It is safe to
-- run more than once: existing tickets (and prices already changed in the
-- admin) are left alone.

create table if not exists public.tickets (
  id              text primary key check (id ~ '^[a-z0-9_]{2,40}$'),  -- stored on attendees.ticket_type
  name_en         text not null,
  name_fr         text not null,
  description_en  text not null default '',
  description_fr  text not null default '',
  amount_cents    integer not null check (amount_cents between 50 and 10000000),  -- Stripe minimum is €0.50
  currency        text not null default 'eur' check (currency = 'eur'),
  available_until timestamptz,                    -- null = no end date
  active          boolean not null default true,  -- false = hidden from the form
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Same as attendees: no public access, everything goes through the
-- service-role API routes.
alter table public.tickets enable row level security;

-- The tickets that were previously hard-coded.
insert into public.tickets
  (id, name_en, name_fr, description_en, description_fr, amount_cents, available_until, sort_order)
values
  (
    'early_bird',
    'Early Bird',
    'Tarif préférentiel (Early Bird)',
    'In-person attendance. Early Bird is open till 31st December, 2026.',
    'Participation en présentiel. Tarif ouvert jusqu''au 31 décembre 2026.',
    50000,
    '2026-12-31T23:59:59+01:00',  -- end of 31 Dec in Libreville/Lagos time (UTC+1)
    10
  ),
  (
    'virtual',
    'Virtual Participation',
    'Participation virtuelle',
    'For virtual delegates.',
    'Pour les délégués en ligne.',
    30000,
    null,
    20
  )
on conflict (id) do nothing;
