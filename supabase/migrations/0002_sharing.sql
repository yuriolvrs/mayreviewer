-- May Reviewer sharing: public profile handle, shared snapshots, reports.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Re-runnable: tables use `if not exists`, policies and functions are replaced.
--
-- Shape notes:
-- - A share is a QUESTIONS-ONLY snapshot in `data` (no notes, no material, no
--   files, no past exam). The client builds it; the size check is a backstop.
-- - Nobody reads `shares` directly except the owner. Recipients and the
--   gallery go through the two security definer functions below, which also
--   decide whether the author's name is shown (`show_name`).

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 32),
  tag text not null check (tag ~ '^[A-Za-z0-9]{3,5}$'),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_handle_idx
  on public.profiles (lower(display_name), lower(tag));

create table if not exists public.shares (
  -- Crockford-style: no 0, O, 1, I, L, U.
  code text primary key check (code ~ '^[A-HJKMNP-TV-Z2-9]{6}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reviewer', 'format')),
  source_id text not null,
  title text not null,
  subject text not null default '',
  question_count int not null default 0,
  data jsonb not null check (pg_column_size(data) < 1000000),
  listed boolean not null default false,
  show_name boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, source_id)
);

create index if not exists shares_listed_idx
  on public.shares (updated_at desc) where listed;

create table if not exists public.share_reports (
  id bigserial primary key,
  code text not null references public.shares (code) on delete cascade,
  reason text not null check (char_length(reason) <= 500),
  reporter_id uuid null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.shares enable row level security;
alter table public.share_reports enable row level security;

drop policy if exists "owner_all" on public.profiles;
create policy "owner_all" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Owner-only: there is deliberately no public policy on shares.
drop policy if exists "owner_all" on public.shares;
create policy "owner_all" on public.shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Anyone may file a report; nobody can read them back through the API.
drop policy if exists "anyone_insert" on public.share_reports;
create policy "anyone_insert" on public.share_reports
  for insert to anon, authenticated with check (true);

-- One share by code, case-insensitive. The author is only named when the
-- owner chose to show it.
create or replace function public.get_share(p_code text)
returns table (
  code text, kind text, title text, subject text, question_count int,
  data jsonb, listed boolean, updated_at timestamptz, owner_id uuid,
  author_name text, author_tag text
)
language sql stable security definer set search_path = public
as $$
  select s.code, s.kind, s.title, s.subject, s.question_count,
         s.data, s.listed, s.updated_at, s.owner_id,
         case when s.show_name then p.display_name end,
         case when s.show_name then p.tag end
  from public.shares s
  left join public.profiles p on p.user_id = s.owner_id
  where upper(s.code) = upper(p_code)
  limit 1;
$$;

-- Public gallery: listed shares only, no `data`. `%`, `_` and `\` in the
-- query are escaped so they match literally.
create or replace function public.list_gallery(
  p_query text default null,
  p_kind text default null,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  code text, kind text, title text, subject text, question_count int,
  listed boolean, updated_at timestamptz, owner_id uuid,
  author_name text, author_tag text
)
language sql stable security definer set search_path = public
as $$
  select s.code, s.kind, s.title, s.subject, s.question_count,
         s.listed, s.updated_at, s.owner_id,
         case when s.show_name then p.display_name end,
         case when s.show_name then p.tag end
  from public.shares s
  left join public.profiles p on p.user_id = s.owner_id
  where s.listed
    and (p_kind is null or s.kind = p_kind)
    and (
      p_query is null or btrim(p_query) = ''
      or s.title ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or s.subject ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by s.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.get_share(text) from public;
revoke execute on function public.list_gallery(text, text, int, int) from public;
grant execute on function public.get_share(text) to anon, authenticated;
grant execute on function public.list_gallery(text, text, int, int) to anon, authenticated;
