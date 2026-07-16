-- 問い合わせ/アカウント削除依頼テーブル追加SQL
-- すでに PRODUCTION_SUPABASE_INIT.sql を実行済みの販売/審査用 project でだけ実行します。
-- 奥さま用の既存 project には実行しないでください。

create extension if not exists pgcrypto;

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  request_type text not null check (request_type in ('contact', 'account_deletion')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_user_created_idx
on public.support_requests(user_id, created_at desc);

create index if not exists support_requests_status_created_idx
on public.support_requests(status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_support_requests_updated_at'
      and tgrelid = 'public.support_requests'::regclass
  ) then
    create trigger set_support_requests_updated_at
    before update on public.support_requests
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert on public.support_requests to authenticated;

alter table public.support_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'support_requests'
      and policyname = 'Users can read own support requests'
  ) then
    create policy "Users can read own support requests"
    on public.support_requests
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'support_requests'
      and policyname = 'Users can create own support requests'
  ) then
    create policy "Users can create own support requests"
    on public.support_requests
    for insert
    to authenticated
    with check (user_id = auth.uid());
  end if;
end;
$$;
