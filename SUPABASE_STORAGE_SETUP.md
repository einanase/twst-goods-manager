# Supabase Storage private bucket setup

このアプリは画像を Supabase Storage の `mailing-images` bucket に保存します。
販売運用では、取引画像に個人情報が含まれる可能性があるため、bucket を public ではなく private にしてください。

## 1. Bucket を private にする

Supabase Dashboard で以下を確認します。

1. Storage
2. `mailing-images`
3. Bucket settings
4. Public bucket を OFF

## 2. Storage policy を設定する

SQL Editor で以下を実行してください。
この Supabase プロジェクトをこのアプリ専用に使う前提で、`storage.objects` の既存ポリシーを一度削除してから作り直します。
他のアプリや他の bucket も同じ Supabase プロジェクトで使っている場合は、実行前に相談してください。

```sql
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

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

## 3. 既存データについて

以前のアプリは `image_url` に public URL を保存していました。
現在のコードは、その public URL から Storage path を推定して signed URL を作る互換処理を持っています。

新しく保存・編集した画像は、public URL ではなく `ユーザーID/ファイル名` の Storage path として保存されます。
