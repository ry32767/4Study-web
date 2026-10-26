export const authoringBrief = `4Study用の問題を、現在の対話で原本と学校解答を照合して作成してください。
利用者がLuna等を選んだチャットでこの依頼文を使います。モデルの自動切替・外部AI API接続は不要です。

1. 指定したテストの全ページと小問番号の一覧を最初に作り、正解・誤答・部分点を問わず全問を対象にする。
2. 元問題は文章・条件・数値・選択肢・共通本文・図表を省略も改変もせず保存する。必要な図表をWebで再現できない場合はneeds_reviewとして不足一覧へ残す。推測してexact/verifiedにしない。
3. 原文と学校解答を照合できた問題だけstatus=verified、source_fidelity=exact。復習用に4択化・短文化した問題は別ID、source_fidelity=adaptedにする。元問題の記述式はそのまま残す。
4. 暗記用はblanksに{id,before,answer,after}を順番に登録する。ワークシートは原本ID・単元ごとにまとまる。穴埋めIDは後から変えない。原文中の答えをbefore/afterへ重複させない。
5. 4択は重複しない4つの選択肢と一意の正答を検証し、answerをchoicesの1つと一致させる。数学は途中式・手順・理由をexplanationへ保存する。
6. 元の採点結果をoriginal_resultに保持する。再演習成績と混同しない。未知の解答や採点は推測しない。
7. 問題・解答・分析を固定IDでVaultへ保存する。既存版は上書きせず、修正時はversionを増やす。
8. JSONは{schema_version:1,questions:[...]}。各問題の必須項目：id,version,subject,course,unit,batch,prompt,answer,explanation,max_points,minutes,kind,status,source_id,source_label,source_page,analysis_id,weakness_id,parent_id。
kindはreview/variant、statusはverified/needs_review。source_fidelityはexact/adapted/unverified。source_questionは小問番号。
original_resultはcorrect/incorrect/partial/ungraded/unknown。choicesとblanksは任意配列。
9. 不足一覧を別途保存し、全問一覧の期待数・確認済み数・要確認数・欠落番号を報告する。未取得ページを全問完了に数えない。
10. ローカルのscripts/audit-question-coverage.pyで原文問題の収録状況を検査し、Web取り込み前に不足を修正する。

対象の原本ID・考査・教科：ここに指定してください。
`;
