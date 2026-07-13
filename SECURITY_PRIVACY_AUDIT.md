# 個人情報保護・ユーザー分離監査メモ

## 目的

販売化に向けて、X ID、取引メモ、取引画像、在庫画像が別アカウントから見えない設計になっているかを確認する。
この監査では実データの中身は変更しない。

## 確認したこと

- モバイル版の `goods` 読み書きは、すべて `userId` を使って絞り込んでいる。
- モバイル版の `trades` 読み書きは、すべて `userId` を使って絞り込んでいる。
- 新規作成時は `user_id` にログイン中ユーザーIDを入れている。
- 更新・削除時は `id` だけではなく `user_id` も条件にしている。
- 画像アップロード先は `mailing-images` bucket の `{userId}/...` 配下になっている。
- 画像削除は `{userId}/` で始まるStorage pathだけを削除する。
- Supabase用SQLは、`goods` / `trades` を `user_id = auth.uid()` で本人の行だけ許可する方針になっている。
- Storage policyは、`mailing-images` 内の `auth.uid()` フォルダだけを読み書きできる方針になっている。

## 今回の補強

Web版の旧画像URL互換処理で、Supabase Storage の署名付きURL作成に失敗したときに元のURLを表示する fallback をやめた。
Storage画像は、署名付きURLを作れない場合は表示しない。

## Supabaseで確認すること

`SUPABASE_SECURITY_CHECK.sql` を Supabase SQL Editor に貼って実行する。
このSQLは `select` だけで、データや設定は変更しない。

特に見る項目:

- `goods` / `trades` の `rls_enabled` が `true`
- `missing_user_id` が両方 `0`
- `mailing-images` bucket の `public` が `false`
- Storage policy に `bucket_id = 'mailing-images'` と `storage.foldername(name)[1] = auth.uid()::text` 相当の条件がある
- `objects_without_first_folder` が `0`
- `objects_whose_first_folder_is_not_auth_user` が `0`
- `storage_path_not_under_owner_folder` が `0`

## 残る販売前チェック

- テスト用に別アカウントを作り、奥様の在庫・取引・画像が見えないことをアプリ上で確認する。
- 画像を1枚アップロードし、別アカウントで同じStorage pathやURLを使っても表示できないことを確認する。
- 販売用Supabase projectは、奥様の実データ入りprojectとは分ける。
- 販売用projectにはテストデータだけを入れて、審査・動作確認を行う。
