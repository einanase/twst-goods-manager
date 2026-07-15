# 頒布用ビルド準備

このメモは、Expo Goではなく、インストールできる形のアプリを作るための手順です。  
まずは `preview` ビルドで実機確認し、ストア提出の直前だけ `production` ビルドを使います。

## いま用意したもの

- `eas.json`
  - `preview`: 内部確認用。Androidは直接インストールしやすいAPK。
  - `production`: ストア提出用。AndroidはGoogle Play向けのAAB。
- `package.json` のビルド用コマンド
  - `npm.cmd run build:android:preview`
  - `npm.cmd run build:ios:preview`
  - `npm.cmd run build:android:production`
  - `npm.cmd run build:ios:production`

## 最初に1回だけやること

PowerShellで次を実行します。

```powershell
cd "D:\リポジトリ\在庫管理_codex\mobile"
npm.cmd exec eas -- login
```

Expoアカウントを持っていなければ、この前にExpoのアカウントを作ります。

## Supabase接続情報をEASに登録する

EASのクラウドビルドでは、手元の `.env` は自動では使われません。  
そのため、SupabaseのURLとpublishable keyをEAS側にも登録します。

`<Project URL>` と `<publishable key>` を実際の値に置き換えて実行します。

```powershell
npm.cmd exec eas -- env:create --name EXPO_PUBLIC_SUPABASE_URL --value "<Project URL>" --environment preview --visibility plaintext
npm.cmd exec eas -- env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "<publishable key>" --environment preview --visibility plaintext
npm.cmd exec eas -- env:create --name EXPO_PUBLIC_SUPABASE_URL --value "<Project URL>" --environment production --visibility plaintext
npm.cmd exec eas -- env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "<publishable key>" --environment production --visibility plaintext
```

`EXPO_PUBLIC_` で始まる値はアプリに埋め込まれる公開値です。Supabaseのpublishable/anon keyはこの用途のキーです。

## まず作るおすすめビルド

最初はAndroid previewが一番ハードル低めです。

```powershell
npm.cmd run build:android:preview
```

完了するとURLが表示されます。そこからAPKをスマホに入れて確認します。

## iPhoneで確認したい場合

iPhoneはAppleの署名が必要です。`preview` ビルドでも、基本的にはApple Developer ProgramやTestFlight/デバイス登録が必要になります。

```powershell
npm.cmd run build:ios:preview
```

初回はEAS CLIがAppleアカウントや証明書について質問します。分からない画面が出たら、その画面のスクショを送ってください。

## 修正が出たとき

修正の流れは今まで通りです。

1. コードを直す
2. `npm.cmd run typecheck`
3. 必要ならExpo Goで軽く見る
4. 頒布版で確認したいタイミングだけpreviewビルドを作り直す

つまり、毎回ビルド必須になるわけではありません。
