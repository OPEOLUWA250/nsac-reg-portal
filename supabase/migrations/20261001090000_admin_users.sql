-- Admins who can sign in to /admin (besides the owners listed in the
-- ADMIN_EMAILS environment variable, who are always super admins).
-- Each row belongs to a Supabase Auth user; deleting that user removes it.
-- Only the server (service role) reads or writes this table: RLS is on and
-- there are no policies, so the public anon key can't see it.

create table if not exists public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
