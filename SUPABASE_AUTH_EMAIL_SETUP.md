# Supabase Auth email setup

Supabase の初期メールは `Confirm Your Signup` / `Confirm your signup` のような汎用文面です。
販売・テスト運用では、利用者が「グッズ交換管理の認証メールだ」と分かるように件名と本文を変更してください。

## 1. 確認メールの件名と本文を変える

Supabase Dashboard で以下を開きます。

1. Authentication
2. Emails
3. Templates
4. Confirm signup

Subject の例:

```text
グッズ交換管理: メールアドレスの確認
```

Message body の例:

```html
<h2>グッズ交換管理のメール確認</h2>

<p>グッズ交換管理でアカウントを作成するため、以下のボタンを押してください。</p>

<p>
  <a href="{{ .ConfirmationURL }}">メールアドレスを確認する</a>
</p>

<p>このメールに心当たりがない場合は、何もせず削除してください。</p>
```

`{{ .ConfirmationURL }}` は Supabase が確認用URLに置き換えるため、消さないでください。

## 2. 確認後に古い画面へ戻らないようにする

Supabase Dashboard で以下を開きます。

1. Authentication
2. URL Configuration
3. Site URL
4. Redirect URLs

`Site URL` は、現在公開している最新版アプリのURLにしてください。
`Redirect URLs` にも同じURLを追加してください。

古い `Twst Goods Manager` のURLが入っていると、確認メールを押した後に古い画面へ戻ることがあります。

## 3. 画像が見えないとき

Storage bucket を private にした後、古いアプリは public URL の画像を直接読みに行くため画像が壊れます。
最新版のアプリは signed URL を作って表示するため、必ず最新版の `index.html` / `app.js` / `style.css` を開くか、公開先へアップロードしてください。
