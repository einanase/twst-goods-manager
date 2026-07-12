# グッズ交換管理 Mobile

React Native / Expo で作るスマホアプリ版です。既存のWeb版は残し、この `mobile` フォルダを別プロジェクトとして育てます。

## いま入っているもの

- Supabase Auth のログイン / 新規登録
- `goods` と `trades` のユーザー別読み書き
- `mailing-images` private bucket への画像アップロード
- private画像を signed URL で表示する仕組み
- 在庫一覧、取引一覧、追加 / 編集 / 削除の最初の画面

## 最初に必要な準備

このPCではまだ `node` / `npm` が使えませんでした。Expo を起動するには Node.js LTS が必要です。

1. Node.js LTS をインストールします  
   https://nodejs.org/

2. 新しいターミナルを開いて確認します

   ```powershell
   node --version
   npm --version
   ```

3. Supabase設定ファイルを作ります

   ```powershell
   cd D:\リポジトリ\在庫管理_codex\mobile
   copy .env.example .env
   ```

4. 依存関係を入れます

   ```powershell
   npm install
   npm run fix-deps
   ```

5. Expo を起動します

   ```powershell
   npm.cmd start -- --tunnel --clear
   ```

6. スマホで試す場合は、Expo Go アプリで表示されたQRコード、または `exp.direct` のURLを開きます。

## Expo Goで開けないとき

このプロジェクトは、Expo Goとの互換性を優先して Expo SDK 54 に固定しています。

- `Project is incompatible with this version of Expo Go` が出る場合は、Expo Goを最新版に更新します。
- それでも出る場合は、古いQRコードや履歴を開いている可能性があります。Expo GoのHomeに戻り、最新の `exp.direct` URLを開き直してください。
- `exp://192.168...` でタイムアウトする場合は、LAN接続ではなく `npm.cmd start -- --tunnel --clear` を使ってください。

## 新規登録メールのリンク設定

React Native版では、確認メールの戻り先として `goodstrade://auth/callback` を使います。Supabase Dashboard で次を追加してください。

1. Authentication → URL Configuration を開く
2. Redirect URLs に `goodstrade://auth/callback` を追加する
3. Save する

Web版のSite URLは、今まで通りGitHub PagesのURLで大丈夫です。

## Supabaseで必ず守る設定

- `goods` と `trades` は RLS を有効にし、`user_id = auth.uid()` の行だけ読める / 書けるようにします。
- `mailing-images` は public bucket を OFF にします。
- Storage policy は `{user_id}/画像ファイル` の形式だけ読み書きできるようにします。
- 本番販売前には、奥様の実データが入ったSupabaseとは別に、販売用Supabase projectを作るのが安全です。
- 販売用Supabaseの作成手順は `PRODUCTION_SUPABASE_SETUP.md` にまとめています。

## 販売化までの次ステップ

1. Node.jsを入れて、このExpo版が起動することを確認する
2. 既存Web版と同じ操作ができるか、在庫と取引の動きを詰める
3. 画像の撮影 / 選択、圧縮、削除のUXを整える
4. アプリ名、アイコン、スプラッシュ画面、利用規約、プライバシーポリシーを用意する
5. 販売用Supabaseを別projectで作り、テストデータだけで動作確認する
6. Apple Developer Program と Google Play Console を準備する
7. EAS Build で TestFlight / 内部テストに出す
