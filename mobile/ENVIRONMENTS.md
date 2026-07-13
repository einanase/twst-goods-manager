# 環境の分け方

このアプリは、同じコードを使いながら Supabase の接続先だけを切り替えられます。
奥さま用の実データは残し、販売・審査・テスト用のデータとは分けて扱います。

## 環境の考え方

| 環境 | 目的 | Supabase | 入れるデータ |
| --- | --- | --- | --- |
| 奥さま用 | これまで通り使い続けるための環境 | 既存の実データ入りproject | 奥さまの実データ |
| 販売/審査用 | App Store / Google Play / テスト配布用 | 新しく作る別project | テストデータ、または各ユーザー自身のデータ |

アプリの改善は同じコードに入ります。
ビルドや起動の直前に `.env` を切り替えることで、奥さま用にも販売用にも同じ改善を反映できます。

## ファイルの役割

- `.env`  
  Expo が実際に読み込む接続先です。実値が入るので Git に入れません。
- `.env.wife`  
  奥さま用Supabaseの実値を手元に保存するファイルです。Git に入れません。
- `.env.production`  
  販売/審査用Supabaseの実値を手元に保存するファイルです。Git に入れません。
- `.env.example`  
  汎用テンプレートです。
- `.env.wife.example`  
  奥さま用Supabaseに接続するためのテンプレートです。実値は入れません。
- `.env.production.example`  
  販売/審査用Supabaseに接続するためのテンプレートです。実値は入れません。

## 奥さま用で起動する

既に `mobile/.env` に奥さま用Supabaseの値が入っている場合は、先に手元専用のバックアップを作ります。

```powershell
cd D:\リポジトリ\在庫管理_codex\mobile
copy .env .env.wife
```

`.env.wife` は Git に入りません。

作り直す場合:

```powershell
cd D:\リポジトリ\在庫管理_codex\mobile
copy .env.wife.example .env.wife
```

その後、`.env.wife` に奥さま用Supabaseの `Project URL` と `publishable key` を入れます。

奥さま用で起動する時は、`.env.wife` を `.env` にコピーします。

```powershell
copy .env.wife .env
```

起動:

```powershell
npm.cmd start -- --tunnel --clear
```

## 販売/審査用で起動する

販売用Supabase projectを作ったあと、次のように `.env` を切り替えます。

```powershell
cd D:\リポジトリ\在庫管理_codex\mobile
copy .env.production.example .env.production
```

その後、`.env.production` に販売/審査用Supabaseの `Project URL` と `publishable key` を入れます。

販売/審査用で起動する時は、`.env.production` を `.env` にコピーします。

```powershell
copy .env.production .env
```

起動:

```powershell
npm.cmd start -- --tunnel --clear
```

## 切り替え前の確認

`.env` を開いて、1行目のURLを確認します。

```text
EXPO_PUBLIC_SUPABASE_URL=https://...
```

- 奥さま用の作業をする時: 既存の奥さま用project URL
- 販売/審査用の作業をする時: 新しく作った販売用project URL

迷ったら、起動前に `.env` を確認します。

## 守るルール

- 奥さまの実データを販売用Supabaseへコピーしない。
- 販売/審査用projectには、テストデータだけを入れて確認する。
- `.env`、`.env.wife`、`.env.production` など、実値入りファイルはコミットしない。
- アプリのコード改善は共通で進める。
- SupabaseのデータやStorageを触る作業をする前に、どのprojectへ接続しているか確認する。
