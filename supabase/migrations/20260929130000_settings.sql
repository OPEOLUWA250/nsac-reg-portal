-- Settings changed from /admin → Settings (no redeploy needed).
-- One row per setting; value is JSON. Safe to run more than once.

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Same as the other tables: no public access, server routes only.
alter table public.settings enable row level security;

-- Registration starts open.
insert into public.settings (key, value)
values ('registration_open', 'true'::jsonb)
on conflict (key) do nothing;
