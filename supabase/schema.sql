-- NewSpace Reg Portal — schema
--
-- The `attendees` table already existed in this Supabase project before this
-- app was built (columns: id, jotform_submission_id, full_name, email,
-- phone, unique_code, checked_in, checked_in_at, checked_in_station,
-- created_at, role). This migration is purely additive — it only adds the
-- columns the app needs that weren't already there. It does not rename or
-- drop anything, and is safe to re-run.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  jotform_submission_id text unique,
  full_name text not null,
  email text not null,
  phone text,
  unique_code text not null unique, -- opaque random token encoded in the QR
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  checked_in_station text,
  role text not null default 'attendee',
  created_at timestamptz not null default now()
);

-- Columns the app additionally needs, added without disturbing the existing shape.
alter table attendees add column if not exists jotform_form_id text;
alter table attendees add column if not exists organization text;
alter table attendees add column if not exists badge_printed_at timestamptz;
alter table attendees add column if not exists badge_print_count int not null default 0;
alter table attendees add column if not exists qr_email_sent_at timestamptz;
alter table attendees add column if not exists raw_payload jsonb;
alter table attendees add column if not exists updated_at timestamptz not null default now();

create unique index if not exists attendees_unique_code_idx on attendees (unique_code);
create index if not exists attendees_email_idx on attendees (email);
create index if not exists attendees_role_idx on attendees (role);

-- Keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists attendees_set_updated_at on attendees;
create trigger attendees_set_updated_at
  before update on attendees
  for each row
  execute function set_updated_at();

-- Row Level Security: lock the table down. All app access goes through
-- server-side API routes using the Supabase service role key, which bypasses
-- RLS — so no public policies are needed. This just ensures the anon/public
-- key (if ever exposed client-side) can't read or write attendee data.
alter table attendees enable row level security;
