import { activeAttempts, keyOf } from "./core.js";
import { schoolGroup } from "./school.js";

export const originalLabels = {
  correct: "元テスト：正解",
  incorrect: "元テスト：誤答",
  partial: "元テスト：部分点",
  ungraded: "元テスト：未採点",
  unknown: "元テスト：未確認",
};
export function recallBlanks(q) {
  return q.blanks?.length
    ? q.blanks
    : [{ id: "answer", before: q.prompt, answer: q.answer, after: "" }];
}
export function mistakeCount(events, q, blankId) {
  return events.filter(
    (e) =>
      e.question_id === q.id &&
      e.question_version === q.version &&
      (!blankId || e.blank_id === blankId) &&
      e.result === "wrong",
  ).length;
}
export function practiceMistakes(attempts, q) {
  return activeAttempts(attempts).filter(
    (a) =>
      a.question_id === q.id &&
      a.question_version === q.version &&
      a.score !== null &&
      a.score < a.max_points,
  ).length;
}
export function questionList(data, state) {
  const latest = new Map();
  for (const q of data.questions.filter((q) => q.status === "verified"))
    if (!latest.has(q.id) || latest.get(q.id).version < q.version)
      latest.set(q.id, q);
  return [...latest.values()].filter(
    (q) =>
      (!state.subject || schoolGroup(q.subject, q.course) === state.subject) &&
      (!state.unit || q.unit === state.unit) &&
      (!state.source || q.source_id === state.source) &&
      (!state.exactOnly || q.source_fidelity === "exact") &&
      (!state.kind || q.kind === state.kind) &&
      (!state.originalResult ||
        (q.original_result ?? "unknown") === state.originalResult),
  );
}
export function memoryView(data, state, { esc, head, filters }) {
  const qs = questionList(data, state).filter(
    (q) => !state.onlyMarked || mistakeCount(data.recall_events, q),
  );
  const sheets = [...new Set(qs.map((q) => `${q.source_id} / ${q.unit}`))];
  const selected = sheets.includes(state.memorySheet)
    ? state.memorySheet
    : sheets[0];
  const visible = qs.filter((q) => `${q.source_id} / ${q.unit}` === selected);
  return `${head("覚える", "付箋をタップして答えを確認。何度でも隠して、思い出す練習をしましょう。")}
    ${filters}<label class="check memory-filter"><input id="only-marked" type="checkbox" ${state.onlyMarked ? "checked" : ""}>暗記で間違えた印がある問題だけ</label>
    <p class="muted">「間違えた」を押すたびに、その箇所の回数が増えます。演習の点数・今日の完了数には加算しません。</p>
    <div class="worksheet-toolbar"><label>暗記ワークシート<select id="memory-sheet">${sheets.map((s) => `<option ${s === selected ? "selected" : ""} value="${esc(s)}">${esc(qs.find((q) => `${q.source_id} / ${q.unit}` === s)?.source_label)} / ${esc(s.split(" / ").slice(1).join(" / "))}</option>`).join("")}</select></label><button data-action="hide-answers">すべて隠す</button><small>${visible.reduce((n, q) => n + recallBlanks(q).length, 0)}箇所</small></div>
    <div class="memory-list worksheet">${
      visible
        .map(
          (
            q,
          ) => `<article class="memory-card" data-memory-key="${esc(keyOf(q))}">
      <div class="section-title"><h2>${esc(q.source_question ? `問${q.source_question}` : q.unit)}</h2><button data-action="solve" data-key="${esc(keyOf(q))}">この問題を解く</button></div>
      <p class="meta">${esc(originalLabels[q.original_result ?? "unknown"])}${q.source_question ? ` ・ 問${esc(q.source_question)}` : ""} ・ 第${q.version}版</p>
      ${recallBlanks(q)
        .map(
          (b, i) => `<div class="recall-line" data-blank-id="${esc(b.id)}">
        <p class="prose">${esc(b.before)} <button class="sticky-answer" data-action="flip-blank" aria-expanded="false" aria-controls="blank-${esc(q.id)}-${q.version}-${i}" aria-label="答えを表示：${i + 1}箇所目"><span class="sticky-cover">タップで確認</span><span id="blank-${esc(q.id)}-${q.version}-${i}" class="revealed-answer" hidden>${esc(b.answer)}</span></button> ${esc(b.after)}</p>
        <div class="actions"><button data-action="recall-wrong" disabled>間違えた ＋1</button><button data-action="recall-known" disabled>覚えていた</button><small class="recall-count">間違えた回数：${mistakeCount(data.recall_events, q, b.id)}回</small></div>
        <p class="recall-status meta" role="status"></p></div>`,
        )
        .join("")}
      <details><summary>解答解説・出典</summary><p class="prose">${esc(q.explanation || "解説は未登録です。")}</p><p class="source">${esc(q.source_label)} / ${esc(q.source_page)}ページ / 問${esc(q.source_question || "未登録")}<br>原本ID ${esc(q.source_id)}</p></details>
    </article>`,
        )
        .join("") ||
      '<p class="panel empty">対象の確認済み問題はありません。教科や印の絞り込みを変更してください。</p>'
    }</div>`;
}
