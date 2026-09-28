-- Standard and Late tickets, added HIDDEN (active = false) so they appear in
-- the admin's "Tickets & prices" panel and ticket filter, but nobody can buy
-- them until an admin sets the real price and clicks "Show".
--
-- The prices below are placeholders — set the real ones in /admin before
-- showing the tickets. Safe to run more than once (existing rows are kept).

insert into public.tickets
  (id, name_en, name_fr, description_en, description_fr, amount_cents, active, sort_order)
values
  ('standard', 'Standard', 'Tarif standard',
   'In-person attendance.', 'Participation en présentiel.',
   50000, false, 12),
  ('late', 'Late Registration', 'Inscription tardive',
   'In-person attendance.', 'Participation en présentiel.',
   50000, false, 14)
on conflict (id) do nothing;

-- Order: Early Bird (10), Standard (12), Late (14), Virtual (20).
