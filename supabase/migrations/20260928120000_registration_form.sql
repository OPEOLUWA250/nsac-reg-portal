-- Our own registration form (replaces Jotform): new attendee columns,
-- Stripe payment tracking, a private bucket for passport uploads, and one
-- registration per email address.
--
-- Run this in the Supabase dashboard (SQL Editor) BEFORE deploying the
-- branch that adds /register. It is safe to run more than once.

-- 1. Fields from the registration form.
alter table public.attendees
  add column if not exists first_name              text,
  add column if not exists last_name               text,
  add column if not exists job_title               text,
  add column if not exists nationality             text,
  add column if not exists residence_country       text,  -- where they'd apply for a visa
  add column if not exists organization_country    text,
  add column if not exists professional_category   text,  -- government | industry | academia | student | media | other
  add column if not exists job_function            text,  -- executive | engineering | rnd | business_development | procurement | legal_policy | other
  add column if not exists needs_invitation_letter boolean,
  add column if not exists passport_path           text,  -- object path in the private 'passports' bucket
  add column if not exists food_allergies          text,
  add column if not exists opt_in_organizer        boolean default false,
  add column if not exists opt_in_sponsors         boolean default false,
  add column if not exists vat_number              text,
  add column if not exists invoice_reference       text,
  add column if not exists source                  text default 'jotform',  -- web | walk_in | jotform
  add column if not exists language                text default 'en',       -- en | fr (language of emails)
  add column if not exists consent_at              timestamptz;              -- accepted safety guideline + privacy policy

-- 2. Tickets and payment (Stripe Checkout).
--    payment_status: 'pending' (form submitted, not paid yet), 'paid',
--    'not_required' (walk-ins / complimentary). NULL = legacy Jotform rows,
--    which Jotform already collected payment for.
alter table public.attendees
  add column if not exists ticket_type       text,
  add column if not exists amount_cents      integer,
  add column if not exists currency          text,
  add column if not exists payment_status    text,
  add column if not exists stripe_session_id text,
  add column if not exists paid_at           timestamptz;

create index if not exists attendees_stripe_session_idx on public.attendees (stripe_session_id);

-- 3. Store emails in lowercase so duplicates are caught regardless of case.
update public.attendees
set email = lower(trim(email))
where email <> lower(trim(email));

-- 4. Private bucket for passport scans (invitation letters). Only the
--    service role (server) can read or write; staff get short-lived links
--    from /admin. 10 MB limit, images and PDF only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'passports', 'passports', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- 5. One registration per email address.
--    This step FAILS if duplicates already exist. Find them first with:
--
--      select lower(email) as email, count(*), array_agg(full_name), array_agg(id)
--      from public.attendees
--      group by lower(email)
--      having count(*) > 1;
--
--    Merge or delete the extra rows (keep the one whose QR was emailed first),
--    then run this statement again.
create unique index if not exists attendees_email_lower_key
  on public.attendees (lower(email));
