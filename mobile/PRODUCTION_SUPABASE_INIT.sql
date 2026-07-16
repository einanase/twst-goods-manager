-- 販売/審査用 Supabase 初期化SQL
-- 新しく作った販売/審査用 project の SQL Editor で、このファイル全体を1回実行します。
-- 奥さま用の既存 project には実行しないでください。
-- このSQLはテーブル、RLS、private Storage bucket を作るだけで、実データは作成・移行しません。

create extension if not exists pgcrypto;

create table if not exists public.goods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  char text not null,
  count integer not null default 0 check (count >= 0),
  planned_count integer not null default 0 check (planned_count >= 0),
  image_url text,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default '交換',
  status text not null default '成約',
  memo text,
  give_items jsonb not null default '[]'::jsonb,
  receive_items jsonb not null default '[]'::jsonb,
  give_price integer not null default 0,
  receive_price integer not null default 0,
  image_url text,
  is_packed boolean not null default false,
  is_sent boolean not null default false,
  is_received boolean not null default false,
  est_ship_date date,
  est_receive_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists goods_user_id_idx on public.goods(user_id);
create index if not exists goods_user_sort_idx on public.goods(user_id, sort_order, created_at);
create index if not exists trades_user_id_idx on public.trades(user_id);
create index if not exists trades_user_status_idx on public.trades(user_id, status);
create index if not exists trades_user_created_idx on public.trades(user_id, created_at desc);
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
    where tgname = 'set_goods_updated_at'
      and tgrelid = 'public.goods'::regclass
  ) then
    create trigger set_goods_updated_at
    before update on public.goods
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_trades_updated_at'
      and tgrelid = 'public.trades'::regclass
  ) then
    create trigger set_trades_updated_at
    before update on public.trades
    for each row execute function public.set_updated_at();
  end if;

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
grant select, insert, update, delete on public.goods to authenticated;
grant select, insert, update, delete on public.trades to authenticated;
grant select, insert on public.support_requests to authenticated;

alter table public.goods enable row level security;
alter table public.trades enable row level security;
alter table public.support_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'goods'
      and policyname = 'Users can read own goods'
  ) then
    create policy "Users can read own goods"
    on public.goods
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'goods'
      and policyname = 'Users can insert own goods'
  ) then
    create policy "Users can insert own goods"
    on public.goods
    for insert
    to authenticated
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'goods'
      and policyname = 'Users can update own goods'
  ) then
    create policy "Users can update own goods"
    on public.goods
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'goods'
      and policyname = 'Users can delete own goods'
  ) then
    create policy "Users can delete own goods"
    on public.goods
    for delete
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trades'
      and policyname = 'Users can read own trades'
  ) then
    create policy "Users can read own trades"
    on public.trades
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trades'
      and policyname = 'Users can insert own trades'
  ) then
    create policy "Users can insert own trades"
    on public.trades
    for insert
    to authenticated
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trades'
      and policyname = 'Users can update own trades'
  ) then
    create policy "Users can update own trades"
    on public.trades
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trades'
      and policyname = 'Users can delete own trades'
  ) then
    create policy "Users can delete own trades"
    on public.trades
    for delete
    to authenticated
    using (user_id = auth.uid());
  end if;

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

insert into storage.buckets (id, name, public)
values ('mailing-images', 'mailing-images', false)
on conflict (id) do update set public = false;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can read own mailing images'
  ) then
    create policy "Users can read own mailing images"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'mailing-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own mailing images'
  ) then
    create policy "Users can upload own mailing images"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'mailing-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own mailing images'
  ) then
    create policy "Users can update own mailing images"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'mailing-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'mailing-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own mailing images'
  ) then
    create policy "Users can delete own mailing images"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'mailing-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end;
$$;
