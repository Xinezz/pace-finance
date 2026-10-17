-- Pace: one private document per signed-in user.
--
-- Run this once in your Supabase project (SQL Editor -> New query -> paste -> Run).
-- It is safe to run again; every statement is idempotent.
--
-- Security model
--   * The browser only ever holds the PUBLIC "anon" key. That key is meant to be public.
--     What protects your data is Row Level Security (RLS), configured below.
--   * RLS makes every query behave as if it had `WHERE user_id = <the signed-in user>`.
--     A signed-in user can only see and change their own row. Signed-out visitors
--     (the "anon" role) can touch nothing at all.
--   * The `service_role` key bypasses RLS. Never put it in this repo, in .env files that get
--     committed, or anywhere in browser code.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- The user's whole Pace document (transactions, goals, budgets, settings...).
  data       jsonb not null,
  -- Bumped on every save. The app only writes if the version it last saw is still current,
  -- so two devices can never silently overwrite each other.
  version    integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  -- Guard against runaway documents (roughly 8 MB of JSON is years of personal transactions).
  constraint user_data_size check (pg_column_size(data) < 8000000)
);

alter table public.user_data enable row level security;
alter table public.user_data force row level security;

-- Start from zero privileges, then grant only what a signed-in user needs.
revoke all on public.user_data from anon, public;
grant select, insert, update, delete on public.user_data to authenticated;

drop policy if exists "user_data: read own row" on public.user_data;
drop policy if exists "user_data: insert own row" on public.user_data;
drop policy if exists "user_data: update own row" on public.user_data;
drop policy if exists "user_data: delete own row" on public.user_data;

create policy "user_data: read own row"
  on public.user_data for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_data: insert own row"
  on public.user_data for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_data: update own row"
  on public.user_data for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_data: delete own row"
  on public.user_data for delete to authenticated
  using (user_id = (select auth.uid()));

-- Keep updated_at honest without trusting the client.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before update on public.user_data
  for each row execute function public.touch_updated_at();

-- "Delete my account": lets a signed-in user erase their own login and, through the
-- ON DELETE CASCADE above, all of their data. It can only ever delete the caller.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
