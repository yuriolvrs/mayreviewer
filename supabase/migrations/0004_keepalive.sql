-- May Reviewer keepalive: a write the daily GitHub Action makes so the
-- free-tier project is never seen as idle and paused.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Re-runnable: the table and row use `if not exists` / `on conflict`, the
-- function is replaced.
--
-- Only a timestamp is stored. No user data.

create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);

insert into public.keepalive (id) values (1) on conflict (id) do nothing;

-- No policies: the table is unreachable through the API except via ping().
alter table public.keepalive enable row level security;

create or replace function public.ping()
returns timestamptz
language sql security definer set search_path = public
as $$
  update public.keepalive set pinged_at = now() where id = 1
  returning pinged_at;
$$;

grant execute on function public.ping() to anon, authenticated;
