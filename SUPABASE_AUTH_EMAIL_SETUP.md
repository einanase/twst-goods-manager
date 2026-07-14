# Supabase Auth email setup

Supabase の初期メールは `Confirm Your Signup` / `Confirm your signup` のような汎用文面です。
販売・テスト運用では、利用者が「グッズ交換管理の認証メールだ」と分かるように件名と本文を変更してください。

## 1. モバイル版の戻り先URLを設定する

React Native / Expo 版では、確認メールの戻り先にアプリ用 deep link を使います。
販売/審査用 Supabase project で以下を設定してください。

1. Authentication
2. URL Configuration
3. Site URL
4. Redirect URLs

`Site URL`:

```text
goodstrade://auth/callback
```

`Redirect URLs`:

```text
goodstrade://auth/callback
```

Expo Goでテストしている間だけ、`Redirect URLs` に以下も追加します。

```text
exp://**
```

PCのメールソフトで認証リンクを開くと、アプリ用URLをPCブラウザが開けず「このサイトにアクセスできません」と表示されることがあります。
その場合でも、Supabase側でメール確認が完了していることがあります。
本番確認ではスマホ側のメールアプリからリンクを開いてください。

## 2. 確認メールの件名と本文を変える

Supabase Dashboard で以下を開きます。

1. Authentication
2. Emails
3. Templates
4. Confirm signup

Subject の例:

```text
グッズ交換管理のメール確認
```

Message body の例:

```html
<h2>グッズ交換管理の登録確認</h2>

<p>グッズ交換管理への登録ありがとうございます。</p>

<p>下のボタンを押して、メールアドレスの確認を完了してください。</p>

<p>
  <a href="{{ .ConfirmationURL }}">メールアドレスを確認する</a>
</p>

<p>このメールに心当たりがない場合は、このメールを破棄してください。</p>
```

`{{ .ConfirmationURL }}` は Supabase が確認用URLに置き換えるため、消さないでください。

## 3. Web版で確認後に古い画面へ戻らないようにする

Web版を使う場合は、`Site URL` と `Redirect URLs` に最新版WebアプリのURLを入れてください。
古い `Twst Goods Manager` のURLが残っていると、確認メールを押した後に古い画面へ戻ることがあります。

## 4. 画像が見えないとき

Storage bucket を private にした後、古いアプリは public URL の画像を直接読みに行くため画像が壊れます。
最新版のアプリは signed URL を作って表示するため、必ず最新版の `index.html` / `app.js` / `style.css` を開くか、公開先へアップロードしてください。
