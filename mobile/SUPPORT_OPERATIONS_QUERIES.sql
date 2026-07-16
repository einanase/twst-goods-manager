-- 問い合わせ運用用SQL
-- 販売/審査用 Supabase project の SQL Editor で使います。
-- 奥さま用 project では使わないでください。

-- 1. 問い合わせ一覧を見る
-- open -> in_progress -> closed の順で、新しい問い合わせを上に表示します。
select
  left(id::text, 8) as request_no,
  created_at,
  status,
  case coalesce(metadata->>'category', 'other')
    when 'bug' then '不具合'
    when 'howto' then '使い方'
    when 'request' then 'リクエスト'
    when 'account' then 'アカウント・データ'
    else 'その他'
  end as category,
  email,
  subject,
  message,
  metadata
from public.support_requests
order by
  case status
    when 'open' then 0
    when 'in_progress' then 1
    else 2
  end,
  created_at desc;

-- 2. 未対応だけを見る
select
  left(id::text, 8) as request_no,
  created_at,
  case coalesce(metadata->>'category', 'other')
    when 'bug' then '不具合'
    when 'howto' then '使い方'
    when 'request' then 'リクエスト'
    when 'account' then 'アカウント・データ'
    else 'その他'
  end as category,
  email,
  subject,
  message
from public.support_requests
where status = 'open'
order by created_at desc;

-- 3. 対応中にする
-- 下の id を、対象問い合わせの本物の id に置き換えてから実行します。
-- request_no は先頭8文字だけなので、更新時は Table Editor で id 全体をコピーしてください。
/*
update public.support_requests
set
  status = 'in_progress',
  metadata = metadata || jsonb_build_object(
    'operator_note', '対応を開始しました',
    'started_at', now()
  )
where id = '00000000-0000-0000-0000-000000000000';
*/

-- 4. 対応済みにする
-- 返信内容や判断メモを metadata に残したい場合は closed_note を書き換えます。
/*
update public.support_requests
set
  status = 'closed',
  metadata = metadata || jsonb_build_object(
    'closed_note', '返信済み',
    'closed_at', now()
  )
where id = '00000000-0000-0000-0000-000000000000';
*/

-- 5. カテゴリ別の件数を見る
select
  case coalesce(metadata->>'category', 'other')
    when 'bug' then '不具合'
    when 'howto' then '使い方'
    when 'request' then 'リクエスト'
    when 'account' then 'アカウント・データ'
    else 'その他'
  end as category,
  status,
  count(*) as count
from public.support_requests
group by category, status
order by category, status;
