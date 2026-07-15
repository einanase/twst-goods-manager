# 販売用 Supabase 分離手順

販売版では、現在の奥さま用Supabase projectをそのまま使わないでください。
X ID、取引画像、メモ、発送予定などは個人情報に近い情報です。
販売/審査/テスト用には、新しいSupabase projectを別に作ります。

## 目的

- 奥さまの実データを販売用アプリから完全に切り離す
- App Store / Google Play 審査時にテストデータだけで確認できるようにする
- 今後のアプリ改善は同じコードで進め、接続先だけ切り替える

## 1. 新しいSupabase projectを作る

1. Supabase Dashboardを開きます。
2. 左上の組織が正しいことを確認します。
3. `New project` を押します。
4. 名前は例として `guttore-production` にします。
5. Database Passwordを設定します。これは後で必要になる可能性があるので控えておきます。
6. Regionは主な利用者に近い場所を選びます。
7. `Create new project` を押し、作成完了まで待ちます。

この時点では、奥さま用projectは触りません。

## 2. Project URL と publishable key を控える

新しく作った販売/審査用projectで次を確認します。

1. 左下の歯車、または `Project Settings` を開きます。
2. `API` を開きます。
3. `Project URL` を控えます。
4. `API Keys` にある `publishable` または `anon public` keyを控えます。

控える値は販売/審査用projectのものだけです。
奥さま用projectのURL/keyをここに混ぜないでください。

## 3. 初期化SQLを実行する

新しく作った販売/審査用projectでだけ実行します。

1. 左メニューの `SQL Editor` を開きます。
2. `New query` または `+` を押します。
3. このリポジトリの [PRODUCTION_SUPABASE_INIT.sql](./PRODUCTION_SUPABASE_INIT.sql) を開きます。
4. ファイルの中身を最初から最後まで全部コピーします。
5. SupabaseのSQL Editorに貼り付けます。
6. `Run` を押します。

成功すると `Success. No rows returned` のような表示になります。

警告が出た場合:

- 新しく作った空の販売/審査用projectなら `Run query` で進めて大丈夫です。
- 奥さま用projectを開いている場合は、必ず `Cancel` してください。

このSQLは、実データを作成・コピーしません。
作るものは、`goods` / `trades` テーブル、ユーザー分離用RLS、private画像bucketだけです。

## 4. 安全設定を確認する

初期化後、新しい販売/審査用projectで [../SUPABASE_SECURITY_CHECK.sql](../SUPABASE_SECURITY_CHECK.sql) を実行します。

確認するポイント:

- `goods` と `trades` の `rls_enabled` が `true`
- `goods` と `trades` のpolicyが `authenticated` かつ `user_id = auth.uid()` になっている
- `mailing-images` bucket の `public` が `false`
- storage policyが `mailing-images` かつ本人のユーザーIDフォルダだけを許可している

新しいprojectなので、Storage object数は `0` で問題ありません。

## 5. Auth設定

Authenticationの設定で以下を行います。

1. `Authentication` を開きます。
2. `Providers` で Email provider を有効にします。
3. `URL Configuration` を開きます。
4. `Redirect URLs` に次を追加します。

```text
guttore://auth/callback
```

5. 新規登録メールの件名と本文を、`グッとれ` の登録メールだと分かる内容に変更します。

本番ビルド後は、必要に応じてApp Store / Google Play用のdeep linkやWeb fallback URLも追加します。

## 6. アプリ側の接続先を切り替える

PCでPowerShellを開きます。

```powershell
cd D:\リポジトリ\在庫管理_codex\mobile
copy .env.production.example .env.production
```

次に `mobile/.env.production` を開き、販売/審査用Supabaseの値に書き換えます。

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-production-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
```

販売/審査用で起動する直前に、次を実行します。

```powershell
copy .env.production .env
npm.cmd start -- --tunnel --clear
```

奥さま用に戻す時は、次を実行します。

```powershell
copy .env.wife .env
npm.cmd start -- --tunnel --clear
```

切り替え前に `mobile/.env` のURLを確認してください。

## 7. 販売前チェック

- 奥さまの実データを販売用Supabaseへコピーしていない
- テストユーザーを2人作り、互いの在庫・取引・画像が見えない
- `mailing-images` bucket の Public bucket が OFF
- 新規登録メールを見て、何のアプリの認証か分かる
- 画像アップロード後、別ユーザーから画像URLを推測しても見えない
