import { SCHOOL, schoolSummary, schoolGroup } from "./school.js";
import { activeAttempts, jstDay } from "./core.js";

export const testKinds = {
  midterm: "中間考査",
  final: "期末考査",
  quiz: "小テスト",
  mock: "模試",
  other: "その他",
};
export function analysisView(data, state, { esc, chart, head, options }) {
  const common = {
    source: state.analysisSource,
    days: state.days,
    kind: state.kind,
  };
  const overall = schoolSummary(data, common);
  const detail = schoolSummary(data, {
    ...common,
    group: state.schoolGroup,
    course: state.schoolCourse,
  });
  const table = (rows, overallTable) =>
    `<div class="table-wrap"><table class="chart-table"><thead><tr><th>分野</th><th>得点率 / ${state.analysisSource === "tests" ? "テスト数" : "問題数"}</th><th>確認</th></tr></thead><tbody>${rows.map((g) => `<tr><td>${esc(g.label)}</td><td>${g.rate === null ? "未評価" : `${g.rate.toFixed(1)}% / ${g.count}${state.analysisSource === "tests" ? "件" : "問"}`}<br><small>${g.count && g.count < 5 ? "データ少 ・ " : ""}${g.eventCount}回の採点</small></td><td><button class="link" data-action="school-evidence" data-level="${overallTable ? "overall" : "detail"}" data-label="${esc(g.label)}">${overallTable ? "教科内を見る" : "記録へ"}</button></td></tr>`).join("")}</tbody></table></div>`;
  return `${head("学習の見取り図", "授業ごとの教科から単元へ。テストと日々の演習を分けて振り返ります。")}<p class="callout">普通科・理系 / 物理選択・地理選択。歴史も基礎として学習中。保健体育・芸術・家庭科・公民・探究は今回の集計対象外です。</p><div class="filters"><label>記録の種類<select id="analysis-source"><option value="practice" ${state.analysisSource === "practice" ? "selected" : ""}>日々の演習</option><option value="tests" ${state.analysisSource === "tests" ? "selected" : ""}>学校テスト・模試</option></select></label>${state.analysisSource === "practice" ? `<label>演習の種類<select id="kind"><option value="" ${!state.kind ? "selected" : ""}>復習と類題</option><option value="review" ${state.kind === "review" ? "selected" : ""}>テストの復習</option><option value="variant" ${state.kind === "variant" ? "selected" : ""}>類題</option></select></label>` : ""}<label>集計期間<select id="days"><option value="30" ${state.days === 30 ? "selected" : ""}>直近30日</option><option value="0" ${state.days === 0 ? "selected" : ""}>全期間</option></select></label></div><div class="grid school-charts"><section class="panel"><h2>全教科のレーダーチャート</h2>${chart(overall)}<p class="chart-legend">未登録の教科も未評価で表示。受験日不明のテストは全期間のみ集計します。得点率は能力偏差値ではありません。</p>${table(overall, true)}</section><section class="panel"><h2>教科内のレーダーチャート</h2><div class="filters"><label>教科<select id="school-group">${overall.map((g) => `<option value="${esc(g.label)}" ${g.label === state.schoolGroup ? "selected" : ""}>${esc(g.label)}</option>`).join("")}</select></label></div><h3>${esc(state.schoolGroup)}${state.analysisSource === "tests" ? "のテスト別得点" : "の単元"}</h3>${chart(detail)}${detail.length < 3 ? '<p class="chart-legend">比較軸が2つ以下のため、棒グラフで表示します。</p>' : ""}${table(detail, false)}<p class="chart-legend">論理国語・古典探究、EC・論理表現、数II・数CIIIはそれぞれ独立した教科です。数CIIIの得点をCとIIIへ推定配分しません。既習の数学I・A・Bなどは記録がある場合に復習用の軸を追加します。</p>${state.analysisSource === "tests" ? '<p class="chart-legend">現在のテスト記録は科目合計です。単元内訳を推測で作りません。単元別の確認には日々の演習を使用します。</p>' : ""}</section></div><section class="panel"><h2>集計の根拠</h2><p class="muted">演習は各問題の最新の有効な採点、テストは訂正を反映した全受験結果から、得点合計 ÷ 満点合計で計算します。未採点・未学習は0点にしません。学習時間は得点に加算しません。</p></section>`;
}
export function testsView(data, state, { esc, head }) {
  const effective = new Set(activeAttempts(data.test_results).map((t) => t.id));
  const rows = data.test_results
    .slice()
    .sort(
      (a, b) =>
        (b.taken_on || "").localeCompare(a.taken_on || "") ||
        (b.created_at || "").localeCompare(a.created_at || ""),
    );
  return `${head("テストの記録", "定期考査・小テスト・模試を、学校の科目名とともに残します。")}<div class="actions" style="margin-bottom:24px"><button class="primary" data-action="test-new">テスト結果を記録する</button></div><section class="panel"><h2>これまでのテスト</h2>${rows.map((t) => `<article class="history-item"><small>${esc(t.taken_on || "受験日不明")} ・ ${testKinds[t.exam_kind]} ・ ${esc(t.subject)} / ${esc(t.course)}</small><h3>${esc(t.exam_title)}</h3><span class="score">${t.score === null ? "未採点" : `${t.score} / ${t.max_points}`}</span> ${!effective.has(t.id) ? '<span class="badge warn">訂正前</span>' : ""}<p class="muted">平均点 ${t.average === null ? "未登録" : t.average} / 順位 ${t.rank ?? "未登録"}${t.participants ? ` / ${t.participants}人` : ""}</p><p class="prose">${esc(t.memo)}</p><p class="source">原本ID ${esc(t.source_id || "未登録")} ・ 分析ID ${esc(t.analysis_id || "未登録")}<br>記録ID ${esc(t.id)}</p>${effective.has(t.id) ? `<button data-action="test-correct" data-id="${esc(t.id)}">テスト記録を訂正</button>` : ""}</article>`).join("") || '<p class="empty">テストの記録はまだありません。答案が返ってきたら、得点と出典を記録しましょう。</p>'}</section>`;
}
export function testDialog(old, { esc }) {
  const group = old ? schoolGroup(old.subject, old.course) : "数II";
  const courses = [...new Set(SCHOOL.map((g) => g.label))];
  return `<h2 style="margin-top:20px">${old ? "テスト記録の訂正" : "テスト結果を記録"}</h2><form id="test-form" class="stack"><label>テスト名<input name="exam_title" maxlength="200" required value="${esc(old?.exam_title || "")}" ${old ? "readonly" : ""} placeholder="例：2年2学期中間考査"></label><div class="two"><label>受験日（不明なら空欄）<input type="date" name="taken_on" max="${jstDay()}" value="${old ? old.taken_on || "" : ""}" ${old ? "readonly" : ""}></label><label>種類<select name="exam_kind">${Object.entries(
    testKinds,
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${old?.exam_kind === key ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div class="two"><label>教科<select name="subject" ${old ? "disabled" : ""}>${SCHOOL.map((g) => `<option value="${g.label}" ${g.label === group ? "selected" : ""}>${g.label}</option>`).join("")}</select>${old ? `<input type="hidden" name="subject" value="${esc(old.subject)}">` : ""}</label><label>学校の科目名<input name="course" list="test-courses" maxlength="100" required value="${esc(old?.course || group)}" ${old ? "readonly" : ""} placeholder="例：数CIII、EC"><datalist id="test-courses">${courses.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label></div><div class="two"><label>得点（空欄は未採点）<input name="score" type="number" min="0" max="10000" step="any" value="${old?.score ?? ""}"></label><label>満点<input name="max_points" type="number" min="0.01" max="10000" step="any" value="${old?.max_points ?? 100}" required></label><label>平均点（任意）<input name="average" type="number" min="0" max="10000" step="any" value="${old?.average ?? ""}"></label><label>順位（任意）<input name="rank" type="number" min="1" step="1" value="${old?.rank ?? ""}"></label><label>受験者数（任意）<input name="participants" type="number" min="1" step="1" value="${old?.participants ?? ""}"></label></div><label>原本ID（任意）<input name="source_id" maxlength="200" value="${esc(old?.source_id || "")}"></label><label>弱点分析ID（任意）<input name="analysis_id" maxlength="200" value="${esc(old?.analysis_id || "")}"></label><label>振り返りメモ<textarea name="memo" maxlength="4000">${esc(old?.memo || "")}</textarea></label><p class="chart-legend">数CIIIの点数を、数学CとIIIへ自動配分しません。科目名は学校の表記を保存します。</p><button class="primary" type="submit">${old ? "訂正したテストを保存" : "テスト結果を保存"}</button><p class="error" role="alert"></p></form>`;
}
