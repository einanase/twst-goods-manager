-- 個人情報保護・ユーザー分離の確認用SQL
-- これは確認専用です。データ、テーブル、ポリシー、Storage object は変更しません。

-- 1. goods / trades の RLS が有効か確認します。
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('goods', 'trades')
order by c.relname;

-- 2. goods / trades のポリシーが authenticated + user_id = auth.uid() になっているか確認します。
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('goods', 'trades')
order by tablename, policyname;

-- 3. user_id が入っていない行がないか確認します。どちらも 0 が安全です。
select 'goods' as table_name, count(*) as missing_user_id
from public.goods
where user_id is null
union all
select 'trades' as table_name, count(*) as missing_user_id
from public.trades
where user_id is null;

-- 4. private画像bucketになっているか確認します。public は false が安全です。
select
  id,
  name,
  public
from storage.buckets
where id = 'mailing-images';

-- 5. Storage policy が本人フォルダだけ許可する形か確認します。
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    policyname ilike '%mailing%'
    or qual ilike '%mailing-images%'
    or with_check ilike '%mailing-images%'
  )
order by policyname;

-- 6. Storage object が auth.users のユーザーIDフォルダ配下に保存されているか確認します。
select
  count(*) as total_objects,
  count(*) filter (
    where coalesce((storage.foldername(o.name))[1], '') = ''
  ) as objects_without_first_folder,
  count(*) filter (
    where not exists (
      select 1
      from auth.users u
      where u.id::text = (storage.foldername(o.name))[1]
    )
  ) as objects_whose_first_folder_is_not_auth_user
from storage.objects o
where o.bucket_id = 'mailing-images';

-- 7. DBに保存されている画像値が、本人フォルダ配下のStorage pathか確認します。
-- external_or_unknown_urls は、外部URLまたは判定不能URLです。
-- storage_path_not_under_owner_folder は 0 が安全です。
-- old_public_storage_urls は、過去のpublic URL形式が残っている件数です。
with image_values as (
  select 'goods' as source_table, id::text as row_id, user_id, image_url
  from public.goods
  where image_url is not null and btrim(image_url) <> ''
  union all
  select 'trades' as source_table, id::text as row_id, user_id, image_url
  from public.trades
  where image_url is not null and btrim(image_url) <> ''
),
normalized as (
  select
    source_table,
    row_id,
    user_id,
    image_url,
    case
      when image_url ~* '^https?://'
        and position('/storage/v1/object/public/mailing-images/' in image_url) > 0
        then split_part(split_part(image_url, '/storage/v1/object/public/mailing-images/', 2), '?', 1)
      when image_url ~* '^https?://'
        and position('/storage/v1/object/sign/mailing-images/' in image_url) > 0
        then split_part(split_part(image_url, '/storage/v1/object/sign/mailing-images/', 2), '?', 1)
      when image_url !~* '^https?://'
        then ltrim(image_url, '/')
      else null
    end as storage_path
  from image_values
)
select
  source_table,
  count(*) as rows_with_image,
  count(*) filter (where storage_path is null) as external_or_unknown_urls,
  count(*) filter (
    where storage_path is not null
      and split_part(storage_path, '/', 1) <> user_id::text
  ) as storage_path_not_under_owner_folder,
  count(*) filter (
    where image_url ~* '/storage/v1/object/public/mailing-images/'
  ) as old_public_storage_urls
from normalized
group by source_table
order by source_table;
