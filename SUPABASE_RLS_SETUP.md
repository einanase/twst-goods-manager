# Supabase RLS setup for per-user data separation

販売版では `goods` と `trades` の中に X ID、取引メモ、画像パスなどの個人情報が入ります。
必ず Supabase 側でも Row Level Security (RLS) を有効にして、ログイン中ユーザー自身の行だけ読める・書ける状態にしてください。

## 1. 既存データの user_id を確認

先に SQL Editor で以下を実行し、`missing_user_id` が 0 であることを確認してください。

```sql
select 'goods' as table_name, count(*) as missing_user_id
from public.goods
where user_id is null
union all
select 'trades' as table_name, count(*) as missing_user_id
from public.trades
where user_id is null;
```

0 ではない場合、その行は誰のデータかDBが判断できません。
販売用RLSを入れる前に、正しいユーザーIDへ紐づける必要があります。

## 2. goods / trades の RLS を有効化してポリシーを設定

`missing_user_id` が 0 なら、以下を SQL Editor で実行してください。
既存の広すぎるポリシーが残ると危ないため、`goods` と `trades` の既存ポリシーを一度削除してから作り直します。

```sql
alter table public.goods enable row level security;
alter table public.trades enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('goods', 'trades')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

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

## 3. 設定後の確認

RLSを入れたあと、別アカウントでログインしても既存データが見えないことを確認してください。
奥さんの既存データは、奥さんのアカウントの `auth.uid()` と各行の `user_id` が一致している必要があります。

ポリシー一覧を確認したい場合は、以下を SQL Editor で実行します。

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('goods', 'trades')
order by tablename, policyname;
```
