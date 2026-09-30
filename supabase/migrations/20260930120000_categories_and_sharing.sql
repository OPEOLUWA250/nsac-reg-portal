-- Registration categories, shareable contact details and promo codes.
-- Run this in the Supabase dashboard (SQL Editor) BEFORE deploying the
-- version of the app that uses it. Safe to run more than once.

-- 1. Registration categories chosen on the form: speaker, delegate, media,
--    exhibitor and vip, stored in attendees.role (it drives the badge
--    colour); host and staff are for walk-ins added in the admin.
--    'press' becomes 'media'; 'attendee' and 'sponsor' become 'delegate'.
--    Keep this list in sync with ATTENDEE_ROLES in src/lib/types.ts.
--
--    Order matters: the old rule doesn't allow 'media', so it is removed
--    before rows are renamed, and the new rule is added last.
alter table public.attendees drop constraint if exists attendees_role_check;

update public.attendees set role = 'media' where role = 'press';
update public.attendees set role = 'delegate' where role in ('attendee', 'sponsor');
-- Anything else unexpected (e.g. an old Jotform value) also becomes
-- delegate, so adding the rule below can't fail.
update public.attendees
  set role = 'delegate'
  where role is null or role not in ('delegate', 'speaker', 'media', 'exhibitor', 'vip', 'host', 'staff');

alter table public.attendees
  add constraint attendees_role_check
  check (role in ('delegate', 'speaker', 'media', 'exhibitor', 'vip', 'host', 'staff'));

alter table public.attendees alter column role set default 'delegate';

-- 2. "Can your details be shared?" When true, scanning the attendee's QR
--    code with a phone opens a page with their contact details; otherwise
--    that page only says they chose not to share. Null = not asked (walk-ins,
--    older registrations): treated as no.
alter table public.attendees add column if not exists share_details boolean;

-- 3. The promo code used at registration, if any (the codes themselves are
--    managed in Stripe from /admin/promo-codes).
alter table public.attendees add column if not exists promo_code text;
