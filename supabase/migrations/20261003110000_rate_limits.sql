-- Limits how often one visitor can call the public checks (promo codes,
-- "already registered?") and admin sign-in, so codes and registrations can't
-- be guessed by trying thousands of times. Keys are hashed in the app (no raw
-- IPs or emails stored). Only the server (service role) can use this.
--
-- Run in the Supabase SQL Editor. Safe to run more than once. Until it runs,
-- the app allows every request (it fails open, so registration never stops).

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one request for p_key; true while the key is within p_max requests
-- in the current p_window_seconds window. One atomic statement, so parallel
-- requests can't slip past the limit.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
