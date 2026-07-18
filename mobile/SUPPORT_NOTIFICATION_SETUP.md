# 問い合わせ通知メール設定手順

この手順は、`support_requests` に新しい問い合わせが追加されたときに、運営宛とユーザー宛へメールを送るための設定です。

実装済みのEdge Function:

- `supabase/functions/notify-support-request/index.ts`

このFunctionは、Supabase Database Webhookから呼ばれたときだけ動きます。
アプリ本体にはメール送信用APIキーを入れません。

## 現在の設定状態

2026年7月19日に、販売/審査用 project `bzppocdaaakkvmrnueyh` へ次を設定済みです。

- Edge Function `notify-support-request` のデプロイ
- `SUPPORT_WEBHOOK_SECRET` の登録
- `support_requests` への `AFTER INSERT` トリガー `notify_support_request_webhook`

そのため、同じprojectでは「5. Database Webhookを作る」を手動で繰り返す必要はありません。
再作成したい場合だけ、下の手順またはSQLトリガーを使います。

## できること

問い合わせが保存されると、次の2通を送ります。

- 運営宛: 新しい問い合わせが来たことを知らせるメール
- ユーザー宛: 受付番号つきの受付完了メール

運営宛メールには本文の冒頭だけを載せます。
X ID、画像、取引メモなど個人情報に近い内容が含まれる可能性があるため、詳細はSupabaseの `support_requests` で確認します。

## 1. Resendを準備する

1. Resendのアカウントを作ります。
2. API Keyを作ります。
3. 送信元メールアドレスを決めます。

本番では独自ドメインの認証が必要です。
まずテストだけなら、Resendのテスト送信元を使える場合があります。

控えるもの:

```text
RESEND_API_KEY
SUPPORT_NOTIFY_FROM
SUPPORT_NOTIFY_TO
```

例:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
SUPPORT_NOTIFY_FROM=グッとれ <support@example.com>
SUPPORT_NOTIFY_TO=your-address@example.com
```

## 2. Webhook用の秘密キーを決める

`SUPPORT_WEBHOOK_SECRET` は、Supabase Database Webhookからの呼び出しだけを通すための合言葉です。

長めのランダム文字列にします。
例:

```text
SUPPORT_WEBHOOK_SECRET=guttore_2026_random_long_secret_replace_me
```

この値は、あとでDatabase Webhookのヘッダーにも同じものを入れます。

## 3. Supabaseに秘密値を登録する

販売/審査用Supabase projectで行います。
奥さま用projectでは設定しないでください。

1. Supabase Dashboardを開きます。
2. 販売/審査用projectを開きます。
3. `Edge Functions` を開きます。
4. `Secrets` または `Secrets Management` を開きます。
5. 次の値を登録します。

```text
RESEND_API_KEY=ResendのAPIキー
SUPPORT_NOTIFY_FROM=グッとれ <送信元メールアドレス>
SUPPORT_NOTIFY_TO=運営が受け取るメールアドレス
SUPPORT_WEBHOOK_SECRET=手順2で決めた長い文字列
SUPPORT_APP_NAME=グッとれ
SUPPORT_DASHBOARD_URL=https://supabase.com/dashboard/project/bzppocdaaakkvmrnueyh/editor
```

`SUPPORT_NOTIFY_TO` は複数にしたい場合、カンマ区切りにできます。

```text
SUPPORT_NOTIFY_TO=one@example.com,two@example.com
```

## 4. Edge Functionをデプロイする

PowerShellで実行します。

```powershell
cd "D:\リポジトリ\在庫管理_codex"
npx.cmd supabase functions deploy notify-support-request --project-ref bzppocdaaakkvmrnueyh --no-verify-jwt
```

`Need to install the following packages:` が出たら `y` を入力します。

デプロイが成功したら、Function URLは次の形になります。

```text
https://bzppocdaaakkvmrnueyh.supabase.co/functions/v1/notify-support-request
```

## 5. Database Webhookを作る

この手順は手動で作る場合の予備手順です。
現在の販売/審査用 project では、CLIから同等のDBトリガーを作成済みです。

Supabase Dashboardで行います。

1. 販売/審査用projectを開きます。
2. `Database` を開きます。
3. `Webhooks` を開きます。
4. `Create a new webhook` を押します。
5. 次のように設定します。

```text
Name: notify-support-request
Table: public.support_requests
Events: Insert
Type: HTTP Request
Method: POST
URL: https://bzppocdaaakkvmrnueyh.supabase.co/functions/v1/notify-support-request
```

Headersには次を入れます。

```text
Content-Type: application/json
x-guttore-webhook-secret: 手順2で決めた SUPPORT_WEBHOOK_SECRET
```

保存します。

## 6. テストする

1. アプリからお問い合わせを1件送ります。
2. Supabaseの `support_requests` に1行増えることを確認します。
3. 運営宛メールが届くことを確認します。
4. 問い合わせしたユーザーのメールにも受付完了メールが届くことを確認します。

届かない場合:

- Supabase Dashboardの `Edge Functions` で `notify-support-request` のログを見る
- `RESEND_API_KEY` が正しいか確認する
- `SUPPORT_NOTIFY_FROM` の送信元がResendで使える状態か確認する
- Webhookの `x-guttore-webhook-secret` が `SUPPORT_WEBHOOK_SECRET` と一致しているか確認する

## メール文面

運営宛:

```text
新しいお問い合わせが届きました。

受付番号: XXXXXXXX
種類: 不具合
件名: 画像が表示されない
登録メール: user@example.com
本文冒頭:
取引画面で画像が...

Supabaseで詳細を確認してください。
```

ユーザー宛:

```text
グッとれサポートです。

お問い合わせを受け付けました。

受付番号: XXXXXXXX
種類: 不具合
件名: 画像が表示されない

状況を確認し、再現に必要な情報があれば登録メールアドレスへ連絡します。
```

## 今後の改善

- `support_requests.metadata` に `notified_at` を残す
- 通知失敗時だけ再送できる仕組みを作る
- DiscordやSlack通知を追加する
- 運営専用の問い合わせ管理画面を作る
