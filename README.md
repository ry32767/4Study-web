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

「解く」は専用画面で回答→解答解説→自己採点→保存と進み、何度でも再挑戦できます。
「覚える」は付箋で答えを隠す暗記画面。「間違えた ＋1」を箇所ごとに累積し、正答でも減らしません。
暗記イベントは演習の点数と分離し、`recall_events` に保存します。
問題JSONの任意項目は `choices`（重複しない4択、`answer` と1項目が一致）、
`blanks`（`{id,before,answer,after}` の配列）、`source_question`（原問題番号）、
`original_result`（`correct`/`incorrect`/`partial`/`ungraded`/`unknown`）。
正解した原問題も再出題でき、教科・単元・元の結果で絞り込めます。旧JSONは引き続き使用できます。
旧DBには追加で `202610250002_practice_memory.sql` を適用してください。既存行は保持します。

「設定とデータ」から問題JSONとテスト記録JSONを取り込めます。内容と保存先の確認後に登録します。
テスト記録は `{ "schema_version": 1, "test_results": [...] }`。受験日不明は `taken_on: null` とし、全期間だけに集計します。
同じIDの同一記録は追加せず、異なる内容は上書きを拒否します。訂正は画面から行います。
原本や氏名を含む資料を公開成果物へ置かないでください。未同期時は同期を完了してからブラウザのデータを整理してください。

## 公開

PagesのSourceはGitHub Actions。push時は検証のみ、公開はworkflow_dispatchで実施します。
本番Supabaseの認証・RLS・端末間同期とバックアップは、各導入環境で別途確認が必要です。
