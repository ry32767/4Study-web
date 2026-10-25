# 4Study Web

教科別の復習・学習記録・得点率分析用の静的Webアプリ。GitHub PagesとSupabase Auth/PostgreSQLを使用します。

このリポジトリには学校の原本・個人の成績・復習教材の実データを含めません。サンプルは合成データです。

## 開発

`cd web` → `npm ci` → `npm run dev`。
検証: `npm test`、`npm run check`、`npm run test:ui`、`npm run build`。

## Supabase

専用プロジェクトで `supabase/migrations` のSQLをファイル名順に適用します。
ブラウザに使うのは公開用Publishable keyだけです。本人用アカウントとRLSで個人データを分離します。
GitHub Actions Variablesの `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を設定後、Pages workflowを手動実行します。
接続前はサンプルモードで動作し、クラウド保存は行いません。

## データ登録

「設定とデータ」から問題JSONとテスト記録JSONを取り込めます。内容と保存先の確認後に登録します。
テスト記録は `{ "schema_version": 1, "test_results": [...] }`。受験日不明は `taken_on: null` とし、全期間だけに集計します。
同じIDの同一記録は追加せず、異なる内容は上書きを拒否します。訂正は画面から行います。
原本や氏名を含む資料を公開成果物へ置かないでください。未同期時は同期を完了してからブラウザのデータを整理してください。

## 公開

PagesのSourceはGitHub Actions。push時は検証のみ、公開はworkflow_dispatchで実施します。
本番Supabaseの認証・RLS・端末間同期とバックアップは、各導入環境で別途確認が必要です。
