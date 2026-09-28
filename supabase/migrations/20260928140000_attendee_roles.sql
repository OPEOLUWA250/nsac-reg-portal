-- The attendees table came with a role check constraint (created in the
-- dashboard before this app existed) that doesn't allow the roles the app
-- uses, e.g. 'delegate' — so every /register submission failed with
-- "violates check constraint attendees_role_check".
--
-- Replace it with the roles the app actually uses. Keep this list in sync
-- with ATTENDEE_ROLES in src/lib/types.ts. Safe to run more than once.
--
-- Run this in the Supabase dashboard (SQL Editor).

-- If this step fails, some existing row has a role outside the list. Find it:
--   select role, count(*) from public.attendees group by role;

alter table public.attendees drop constraint if exists attendees_role_check;

alter table public.attendees
  add constraint attendees_role_check
  check (role in ('attendee', 'delegate', 'speaker', 'host', 'staff', 'sponsor', 'press'));
