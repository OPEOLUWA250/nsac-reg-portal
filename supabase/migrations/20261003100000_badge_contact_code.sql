-- A second, public code per attendee for the QR printed on their badge.
--
-- unique_code is the entry credential (the QR in the confirmation email,
-- accepted by the check-in scanner). Badges are worn in the open, so they
-- carry contact_code instead: it opens the contact page (/p/<code>) but the
-- scanner refuses it, so a photo of someone's badge can't get anyone in.
--
-- Run in the Supabase SQL Editor before printing badges. Safe to run more
-- than once. Until it runs, badges print without a QR.

alter table public.attendees
  add column if not exists contact_code text;

alter table public.attendees
  alter column contact_code set default replace(gen_random_uuid()::text, '-', '');

update public.attendees
set contact_code = replace(gen_random_uuid()::text, '-', '')
where contact_code is null;

create unique index if not exists attendees_contact_code_key
  on public.attendees (contact_code);
