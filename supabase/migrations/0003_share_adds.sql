-- May Reviewer sharing: anonymous count of how many times a share was added.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Re-runnable: the column uses `if not exists`, the function is replaced.
--
-- Only a number is stored. No viewer identity, no views, no quiz counts.
-- The owner reads `add_count` through the existing owner-only RLS on shares.

alter table public.shares
  add column if not exists add_count int not null default 0;

-- Anyone (signed in or not) may bump the count. updated_at is not touched.
create or replace function public.record_share_add(p_code text)
returns void
language sql security definer set search_path = public
as $$
  update public.shares
  set add_count = add_count + 1
  where upper(code) = upper(p_code);
$$;

revoke execute on function public.record_share_add(text) from public;
grant execute on function public.record_share_add(text) to anon, authenticated;
