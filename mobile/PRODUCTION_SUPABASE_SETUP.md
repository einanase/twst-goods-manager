# 販売用 Supabase 分離手順

販売版では、現在の実データ入りSupabaseをそのまま使わないでください。X ID、取引画像、メモ、発送予定などは個人情報に近い情報です。開発用と販売用を分けることで、テスト中の操作や不具合で奥様のデータに影響しない状態にします。

## 1. 新しいSupabase projectを作る

1. Supabase Dashboardを開く
2. New projectを作成
3. 名前は例として `goods-trade-manager-production`
4. Regionは主な利用者に近い場所を選ぶ
5. Project URL と publishable key を控える

## 2. テーブルを作る

新しいプロジェクトの SQL Editor で以下を実行します。

```sql
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

create index if not exists goods_user_id_idx on public.goods(user_id);
create index if not exists trades_user_id_idx on public.trades(user_id);
create index if not exists trades_user_status_idx on public.trades(user_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_goods_updated_at on public.goods;
create trigger set_goods_updated_at
before update on public.goods
for each row execute function public.set_updated_at();

drop trigger if exists set_trades_updated_at on public.trades;
create trigger set_trades_updated_at
before update on public.trades
for each row execute function public.set_updated_at();
```

## 3. RLSを有効にする

同じ SQL Editor で以下を実行します。

```sql
alter table public.goods enable row level security;
alter table public.trades enable row level security;

create policy "Users can read own goods"
on public.goods
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own goods"
on public.goods
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own goods"
on public.goods
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own goods"
on public.goods
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own trades"
on public.trades
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own trades"
on public.trades
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own trades"
on public.trades
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own trades"
on public.trades
for delete
to authenticated
using (user_id = auth.uid());
```

## 4. private画像bucketを作る

SQL Editor で以下を実行します。

```sql
insert into storage.buckets (id, name, public)
values ('mailing-images', 'mailing-images', false)
on conflict (id) do update set public = false;

create policy "Users can read own mailing images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mailing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can upload own mailing images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mailing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create policy "Users can delete own mailing images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mailing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

## 5. Auth設定

Authenticationの設定で以下を行います。

1. Email providerを有効にする
2. Confirm signup のメール件名と本文をアプリ名に合わせる
3. URL Configuration の Redirect URLs に `goodstrade://auth/callback` を追加する
4. 本番ビルド後に、必要なら本番用のdeep linkやWeb fallback URLも追加する

## 6. アプリ側の接続先を切り替える

`mobile/.env.production.example` を参考に、本番用の値を設定します。

```powershell
copy .env.production.example .env
```

その後、販売用Supabaseの Project URL と publishable key に書き換えます。

## 7. 販売前チェック

- 奥様の実データを販売用Supabaseへコピーしない
- テストユーザーを2人作り、互いの在庫・取引・画像が見えないことを確認する
- `mailing-images` bucket の Public bucket が OFF であることを確認する
- 新規登録メールがアプリ名で届くことを確認する
- 画像アップロード後、別ユーザーからURLを推測しても見えないことを確認する

