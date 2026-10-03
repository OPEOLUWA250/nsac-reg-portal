-- Lock the attendees table to the server. The anon key is public (it ships to
-- every browser for admin sign-in), so without Row Level Security anyone
-- could read every registration (emails, phones, nationality, passport paths)
-- straight from the Supabase API. The app only uses the service role, which
-- bypasses RLS, so this changes nothing for the app. Safe to run more than once.

alter table public.attendees enable row level security;

-- Remove any policy that opened the table to the public (anon) or to
-- signed-in admins' browser sessions (authenticated). Lists them first:
--   select policyname, roles, cmd from pg_policies where tablename = 'attendees';
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'attendees' loop
    execute format('drop policy %I on public.attendees', p.policyname);
  end loop;
end $$;

revoke all on public.attendees from anon, authenticated;
