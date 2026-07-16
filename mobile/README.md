# グッとれ Mobile

グッズ交換管理アプリ「グッとれ」のReact Native / Expo版です。

既存のWeb版は残し、この `mobile` フォルダを別プロジェクトとして育てます。

## いま入っているもの

- Supabase Auth のログイン / 新規登録
- `goods` と `trades` のユーザー別読み書き
- `mailing-images` private bucket への画像アップロード
- private画像を signed URL で表示する仕組み
- 在庫一覧、取引一覧、追加 / 編集 / 削除の基本画面
- 取引ステータスや進行フラグ変更時の確認ダイアログ
- スマホ向けの分割式取引フォーム
- 設定画面の利用規約 / プライバシーポリシー / 問い合わせフォーム
- パスワード再確認つきのアカウント削除導線

## 環境の分け方

奥さま用の実データ入りSupabaseと、販売/審査用Supabaseは分けます。
アプリのコードは共通で、起動やビルドの直前に `mobile/.env` の接続先だけを切り替えます。

詳しくは [ENVIRONMENTS.md](./ENVIRONMENTS.md) を見てください。

## 最初に必要な準備

1. Node.js LTS をインストールします。

   https://nodejs.org/

2. 新しいターミナルを開いて確認します。

   ```powershell
   node --version
   npm --version
   ```

3. Supabase設定ファイルを作ります。

   既に `mobile/.env` に奥さま用Supabaseの値が入っている場合は、先に手元専用のバックアップを作ります。

   ```powershell
   cd D:\リポジトリ\在庫管理_codex\mobile
   copy .env .env.wife
   ```

   奥さま用を作り直す場合:

   ```powershell
   cd D:\リポジトリ\在庫管理_codex\mobile
   copy .env.wife.example .env.wife
   ```

   販売/審査用を作る場合:

   ```powershell
   cd D:\リポジトリ\在庫管理_codex\mobile
   copy .env.production.example .env.production
   ```

   その後、`.env.wife` または `.env.production` に使いたいSupabaseの `Project URL` と `publishable key` を入れます。
   実値入りの `.env` / `.env.wife` / `.env.production` は Git に入れません。

   起動前に、使いたい環境を `.env` にコピーします。

   ```powershell
   copy .env.wife .env
   ```

   または

   ```powershell
   copy .env.production .env
   ```

4. 依存関係を入れます。

   ```powershell
   npm install
   npm run fix-deps
   ```

5. Expo を起動します。

   ```powershell
   npm.cmd start -- --tunnel --clear
   ```

6. スマホで試す場合は、Expo Go アプリで表示されたQRコード、または `exp.direct` のURLを開きます。

## Expo Goで開けないとき

このプロジェクトは、Expo Goとの互換性を優先して Expo SDK 54 に固定しています。

- `Project is incompatible with this version of Expo Go` が出る場合は、Expo Goを最新版に更新します。
- それでも出る場合は、古いQRコードや履歴を開いている可能性があります。Expo GoのHomeに戻り、最新の `exp.direct` URLを開き直してください。
- `exp://192.168...` でタイムアウトする場合は、LAN接続ではなく `npm.cmd start -- --tunnel --clear` を使ってください。
- `ERR_NGROK_3004` が出る場合は、PC側のExpoサーバーが止まっているか、古いtunnelを開いています。Expoを起動し直して、新しいQRまたはURLを開いてください。

## 新規登録メールのリンク設定

React Native版では、確認メールの戻り先として `guttore://auth/callback` を使います。
Supabase Dashboard で次を追加してください。

1. Authentication -> URL Configuration を開く
2. Redirect URLs に `guttore://auth/callback` を追加する
3. Save する

Web版のSite URLは、今まで通りGitHub PagesのURLで大丈夫です。

## Supabaseで必ず守る設定

- `goods` と `trades` は RLS を有効にし、`user_id = auth.uid()` の行だけ読める / 書けるようにします。
- `mailing-images` は public bucket を OFF にします。
- Storage policy は `{user_id}/画像ファイル` の形式だけ読み書きできるようにします。
- 本番販売前には、奥さまの実データが入ったSupabaseとは別に、販売用Supabase projectを作ります。
- 販売用Supabaseの作成手順は [PRODUCTION_SUPABASE_SETUP.md](./PRODUCTION_SUPABASE_SETUP.md) にまとめています。
- 現在の安全確認メモは [../SECURITY_PRIVACY_AUDIT.md](../SECURITY_PRIVACY_AUDIT.md) にまとめています。

## 販売化までの次ステップ

1. 既存Web版と同じ操作ができるか、在庫と取引の動きを詰める
2. 画像の撮影 / 選択、圧縮、削除のUXを整える
3. アプリ名、アイコン、スプラッシュ画面を用意する
4. 利用規約、プライバシーポリシーを用意する
5. 販売用Supabaseを別projectで作り、テストデータだけで動作確認する
6. Apple Developer Program と Google Play Console を準備する
7. EAS Build で TestFlight / 内部テストに出す
