-- May Reviewer Phase 4: per-user sync tables + row-level security.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Shape notes:
-- - The full Reviewer / QuizAttempt / ExamFormat / UserSettings object lives in
--   the `data` JSONB column (the app's localStorage model is the source of
--   truth for shape, so schema churn stays out of SQL). `updated_at` is
--   duplicated as a real column because last-write-wins compares on it.
-- - Attempts are append-only snapshots; they carry no updated_at of their own
--   and sync as a union by id. `taken_at` is kept as a column for ordering.
-- - Attachments (PDF bytes) stay local-first in IndexedDB — no Storage bucket
--   in v1, so there is deliberately nothing for files here.

create table if not exists public.reviewers (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reviewer_id text not null,
  data jsonb not null,
  taken_at timestamptz not null default now()
);

create table if not exists public.formats (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.reviewers enable row level security;
alter table public.attempts enable row level security;
alter table public.formats enable row level security;
alter table public.settings enable row level security;

-- Owner-only: a signed-in user sees and touches exactly their own rows.
-- Re-runnable (drops first) so a half-applied run can simply be run again.
drop policy if exists "owner_all" on public.reviewers;
create policy "owner_all" on public.reviewers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_all" on public.attempts;
create policy "owner_all" on public.attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_all" on public.formats;
create policy "owner_all" on public.formats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_all" on public.settings;
create policy "owner_all" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists reviewers_user_updated_idx
  on public.reviewers (user_id, updated_at desc);
create index if not exists attempts_user_taken_idx
  on public.attempts (user_id, taken_at desc);
create index if not exists formats_user_updated_idx
  on public.formats (user_id, updated_at desc);
