import { authoringBrief } from "./authoring.js";
import { prepareTests } from "./test-import.js";
import "./style.css";
import { Store, client } from "./store.js";
import { samples } from "./sample.js";
import { SCHOOL, schoolGroup, schoolSummary, validateTest } from "./school.js";
import { analysisView, testsView, testDialog } from "./school-ui.js";
import {
  memoryView,
  questionList,
  mistakeCount,
  practiceMistakes,
  originalLabels,
} from "./practice.js";
import {
  jstDay,
  keyOf,
  summarize,
  activeAttempts,
  validateQuestions,
  dueFor,
} from "./core.js";

const app = document.querySelector("#app");
const esc = (v = "") =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const dateLabel = (v) =>
  new Date(v).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const state = {
  store: null,
  tab: "today",
  schoolGroup: "数II",
  schoolCourse: "",
  analysisSource: "practice",
  testOld: null,
  subject: "",
  unit: "",
  kind: "",
  days: 30,
  budget: 20,
  historyId: "",
  busy: false,
  modal: null,
  practice: null,
  originalResult: "",
  onlyMarked: false,
  memorySheet: "",
  source: "",
  exactOnly: false,
  practiceDrafts: new Map(),
  generation: 0,
};
const titles = {
  today: "今日の学習",
  subjects: "教科別の演習",
  memory: "覚える",
  analysis: "学習の見取り図",
  history: "学習の記録",
  test_records: "テストの記録",
  settings: "設定とデータ",
};
let noticeTimer;
function notice(message) {
  clearTimeout(noticeTimer);
  document.querySelector("#notice").textContent = message;
  noticeTimer = setTimeout(() => {
    document.querySelector("#notice").textContent = "";
  }, 8000);
}
function subjects() {
  return [
    ...new Set([
      ...SCHOOL.map((g) => g.label),
      ...state.store.data.questions
        .map((q) => schoolGroup(q.subject, q.course))
        .filter(Boolean),
    ]),
  ];
}

function options(values, current, first) {
  return `<option value="">${first}</option>${values.map((s) => `<option ${s === current ? "selected" : ""} value="${esc(s)}">${esc(s)}</option>`).join("")}`;
}
function subjectFilter() {
  return `<label>教科<select id="subject">${options(subjects(), state.subject, "すべての教科")}</select></label>`;
}
function kindFilter() {
  return `<label>問題の種類<select id="kind">${options(["review", "variant"], state.kind, "復習と類題").replace(">review<", ">テストの復習<").replace(">variant<", ">類題<")}</select></label>`;
}
function head(text, sub) {
  return `<div class="page-head"><div><p class="eyebrow">${esc(jstDay().replaceAll("-", " / "))} ・ 学びを、少しずつ。</p><h1 id="page-title" tabindex="-1">${text}</h1><p class="muted">${sub}</p></div></div>`;
}
function login() {
  state.store = null;
  state.practice = null;
  state.tab = "today";
  app.innerHTML = `<main class="login" id="main"><section><div class="brand"><span class="brand-mark">4</span>4Study</div><h1>今日の一問が、<br>明日の「わかる」に。</h1><p class="muted">テストのつまずきを振り返り、類題でもう一度。<br>毎日の復習と、教科ごとの成長をひとつの場所に。</p><div class="callout">記録は本人だけがアクセスできるSupabaseへ。<br>学校の原本は、これまでどおりVaultに保管します。</div></section><section class="panel login-form"><h2>学習をはじめる</h2>${client ? `<form id="login-form" class="stack"><label>メールアドレス<input type="email" name="email" autocomplete="username" required></label><label>パスワード<input type="password" name="password" autocomplete="current-password" required></label><p class="error" id="login-error" role="alert"></p><button class="primary" type="submit">ログイン</button></form><p class="login-note">Supabaseに作成した個人用アカウントでログインしてください。</p>` : '<p class="login-note">Supabaseの接続先は未設定です。まずはサンプルで演習と記録を試せます。</p>'}<div class="demo-note"><button data-action="demo">サンプルで試す</button><small>合成問題のみ。記録はこのブラウザに保存します。</small></div></section></main>`;
}
async function enter(user = null) {
  const generation = ++state.generation;
  const store = new Store(user);
  app.innerHTML =
    '<main id="main" class="panel" aria-busy="true">学習記録を読み込んでいます…</main>';
  await store.load();
  if (generation !== state.generation) return;
  state.store = store;
  try {
    await store.flush();
  } catch (e) {
    notice(e.message);
  }
  await store.plan(jstDay(), state.budget);
  if (generation !== state.generation) return;
  await render();
}
function doneToday(q) {
  return activeAttempts(state.store.data.attempts).some(
    (a) =>
      a.question_id === q.id &&
      a.question_version === q.version &&
      jstDay(new Date(a.attempted_at)) === jstDay(),
  );
}
function row(q, reason = "") {
  const done = doneToday(q);
  return `<article class="question-row"><div><span class="badge">${esc(schoolGroup(q.subject, q.course) || q.subject)}</span> <small>${esc(q.course)} / ${esc(q.unit)}</small><h3>${esc(q.prompt.length > 60 ? q.prompt.slice(0, 60) + "…" : q.prompt)}</h3><p class="meta">${q.kind === "variant" ? "類題" : "復習"} ・ ${q.minutes}分${reason ? ` ・ ${esc(reason)}` : ""}<br>${q.source_fidelity === "exact" ? "原文照合済み" : q.source_fidelity === "adapted" ? "復習用に編集" : "原文一致は未確認"} ・ ${esc(originalLabels[q.original_result ?? "unknown"])} ・ 演習の誤答 ${practiceMistakes(state.store.data.attempts, q)}回 ・ 暗記の印 ${mistakeCount(state.store.data.recall_events, q)}回</p></div><div class="actions"><button ${done ? "" : 'class="primary"'} data-action="solve" data-key="${esc(keyOf(q))}">${done ? "もう一度" : "解く"}</button><button data-action="memorize" data-key="${esc(keyOf(q))}">覚える</button></div></article>`;
}
function chart(groups) {
  if (groups.length < 3)
    return `<div class="bars">${groups.map((g) => `<div><div class="bar-label"><span>${esc(g.label)}</span><strong>${g.rate === null ? "未評価" : `${g.rate.toFixed(0)}%`}</strong></div><div class="bar-track"><span style="width:${g.rate ?? 0}%"></span></div></div>`).join("")}</div>`;
  const n = groups.length,
    cx = 180,
    cy = 160,
    radius = 106;
  const pt = (i, ratio) => {
    const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
    return [
      cx + Math.cos(angle) * radius * ratio,
      cy + Math.sin(angle) * radius * ratio,
    ];
  };
  const points = (ratio) =>
    groups.map((g, i) => pt(i, ratio).join(",")).join(" ");
  return `<svg class="chart" viewBox="0 0 360 330" role="img" aria-label="${esc(groups.map((g) => `${g.label} ${g.rate === null ? "未評価" : Math.round(g.rate) + "パーセント"}`).join("、"))}">${[0.25, 0.5, 0.75, 1].map((r) => `<polygon class="ring" points="${points(r)}"/>`).join("")}${groups
    .map((g, i) => {
      const [x, y] = pt(i, 1),
        [tx, ty] = pt(i, 1.28);
      return `<line class="ring" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle">${esc(g.label.slice(0, 12))}</text>`;
    })
    .join(
      "",
    )}${groups.every((g) => g.rate !== null) ? `<polygon class="area" points="${groups.map((g, i) => pt(i, g.rate / 100).join(",")).join(" ")}"/>` : ""}${groups
    .map((g, i) => {
      if (g.rate === null) return "";
      const [x, y] = pt(i, g.rate / 100);
      return `<circle class="dot" cx="${x}" cy="${y}" r="4"/>`;
    })
    .join("")}</svg>`;
}
function stats() {
  return summarize(state.store.data.questions, state.store.data.attempts, {
    days: state.days,
    subject: state.subject,
    kind: state.kind,
  });
}
function today() {
  const plan = state.store.data.daily_sets.find((p) => p.day === jstDay());
  const qs = plan.items
    .map((item) => ({
      q: state.store.data.questions.find(
        (q) => q.id === item.question_id && q.version === item.question_version,
      ),
      reason: item.reason,
    }))
    .filter((r) => r.q);
  const complete = qs.filter((r) => doneToday(r.q)).length;
  const minutes = qs
    .filter((r) => !doneToday(r.q))
    .reduce((n, r) => n + r.q.minutes, 0);
  const next = qs.find((r) => !doneToday(r.q));
  const groups = schoolSummary(state.store.data);
  return `${head("今日の学習", "思い出す、確かめる、もう一度解く。今日の復習をここから。")}<section class="hero"><div><p class="eyebrow">今日の復習プラン</p><h2>${qs.length ? (complete === qs.length ? "今日の予定を完了しました。" : `残り${minutes}分。自分のペースで進もう。`) : "次の学びを用意しよう。"}</h2><p class="muted">${qs.length ? (state.store.demo ? "復習のタイミングと前回の結果から選びました。サンプルの記録は、このブラウザに保存します。" : "復習のタイミングと前回の結果から選びました。今日の問題は、端末を変えても同じです。") : "復習期限が来た問題はありません。教科別の演習から自由に解くか、確認済み問題を追加できます。"}</p>${next ? `<button class="primary" data-action="solve" data-key="${esc(keyOf(next.q))}">続きからはじめる →</button>` : '<button class="primary" data-action="tab" data-tab="subjects">教科別の演習を見る →</button>'}</div><div class="hero-stat"><strong>${complete}<span style="font-size:22px"> / ${qs.length}</span></strong><div class="progress" role="progressbar" aria-label="今日の完了問題" aria-valuenow="${complete}" aria-valuemin="0" aria-valuemax="${Math.max(qs.length, 1)}"><span style="width:${qs.length ? (complete / qs.length) * 100 : 0}%"></span></div><small>今日の完了数</small></div></section><div class="grid"><section class="panel"><div class="section-title"><h2>今日取り組む問題</h2><small>目標 ${plan.budget}分</small></div>${qs.map((r) => row(r.q, doneToday(r.q) ? "今日の記録あり" : r.reason)).join("") || '<p class="empty">今日の復習候補はありません。</p>'}</section><section class="panel"><div class="section-title"><h2>教科のバランス</h2><button class="link" data-action="tab" data-tab="analysis">詳しく</button></div>${chart(groups)}<p class="chart-legend">直近30日・各問題の最新得点。未評価の軸は点を表示しません。</p><ul class="metric-list"><li><span>これまでの解答</span><strong>${activeAttempts(state.store.data.attempts).length}回</strong></li><li><span>解答以外の学習</span><strong>${state.store.data.activities.reduce((n, a) => n + a.minutes, 0)}分</strong></li></ul></section></div>`;
}
function exerciseFilters() {
  const units = [
    ...new Set(
      state.store.data.questions
        .filter(
          (q) =>
            !state.subject ||
            schoolGroup(q.subject, q.course) === state.subject,
        )
        .map((q) => q.unit),
    ),
  ];
  const sources = [
    ...new Map(
      state.store.data.questions
        .filter(
          (q) =>
            !state.subject ||
            schoolGroup(q.subject, q.course) === state.subject,
        )
        .map((q) => [q.source_id, q.source_label]),
    ).entries(),
  ];
  return `<div class="filters"><label>教材・元テスト<select id="source"><option value="">すべての教材</option>${sources.map(([id, label]) => `<option value="${esc(id)}" ${state.source === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>${subjectFilter()}<label>単元<select id="unit">${options(units, state.unit, "すべての単元")}</select></label>${kindFilter()}<label>元テストの結果<select id="original-result"><option value="">正解・誤答をすべて表示</option>${Object.entries(
    originalLabels,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${state.originalResult === k ? "selected" : ""}>${v}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="check"><input type="checkbox" id="exact-only" ${state.exactOnly ? "checked" : ""}>原文照合済みの元テスト問題のみ</label></div>`;
}
function exercises() {
  const qs = questionList(state.store.data, state);
  const pending = state.store.data.questions.filter(
    (q) =>
      q.status !== "verified" &&
      (!state.source || q.source_id === state.source) &&
      (!state.subject || schoolGroup(q.subject, q.course) === state.subject),
  );
  return `${head("教科別の演習", "正解した問題も、間違えた問題も。教科と単元を選んで何度でも解き直せます。")}${exerciseFilters()}<p class="muted">登録済み ${qs.length}問・要確認 ${pending.length}件。全問収録は原本の小問一覧との照合が必要です。</p>${qs.length ? `<button class="primary" data-action="solve" data-key="${esc(keyOf(qs[0]))}">このセットを解く</button>` : ""}<section class="panel"><div class="section-title"><h2>${esc(state.subject || "すべての教科")}</h2><small>${qs.length}問</small></div>${qs.map((q) => row(q, dueFor(q, state.store.data.attempts).reason)).join("") || '<p class="empty">確認済みの問題がありません。設定から問題JSONを取り込めます。</p>'}</section>`;
}
function memory() {
  return memoryView(state.store.data, state, {
    esc,
    head,
    filters: exerciseFilters(),
  });
}
function trend() {
  const all = activeAttempts(state.store.data.attempts);
  const weeks = [3, 2, 1, 0].map((i) => {
    const end = Date.now() - i * 7 * 86400000,
      start = end - 7 * 86400000;
    const rows = all.filter(
      (a) =>
        +new Date(a.attempted_at) > start &&
        +new Date(a.attempted_at) <= end &&
        a.score !== null &&
        state.store.data.questions.some(
          (q) =>
            q.id === a.question_id &&
            q.version === a.question_version &&
            (!state.subject ||
              schoolGroup(q.subject, q.course) === state.subject) &&
            (!state.kind || q.kind === state.kind),
        ),
    );
    const max = rows.reduce((n, a) => n + a.max_points, 0);
    return {
      label: i ? `${i}週前` : "直近7日",
      count: rows.length,
      rate: max ? (rows.reduce((n, a) => n + a.score, 0) / max) * 100 : null,
    };
  });
  return `<div class="trend">${weeks.map((w) => `<div class="trend-col" title="${w.label}: ${w.rate === null ? "未評価" : w.rate.toFixed(1) + "%"} (${w.count}回)"><span style="height:${w.rate ?? 0}%;${w.rate === null ? "background:var(--border)" : ""}"></span><small>${w.label}</small></div>`).join("")}</div><p class="chart-legend">${weeks.map((w) => `${w.label}: ${w.rate === null ? "未評価" : w.rate.toFixed(0) + "%"}（${w.count}回）`).join(" / ")}<br>推移は再演習を含む全採点結果。上のレーダーとは集計方法が異なります。</p>`;
}
function analysis() {
  return (
    analysisView(state.store.data, state, { esc, chart, head, options }) +
    (state.analysisSource === "practice"
      ? `<section class="panel"><h2>4週間の変化</h2>${trend()}</section>`
      : "")
  );
}
function test_records() {
  return testsView(state.store.data, state, { esc, head });
}

function history() {
  const qs = new Map(state.store.data.questions.map((q) => [keyOf(q), q]));
  const effective = new Set(
    activeAttempts(state.store.data.attempts).map((a) => a.id),
  );
  const attempts = state.store.data.attempts
    .slice()
    .sort((a, b) => b.attempted_at.localeCompare(a.attempted_at))
    .filter(
      (a) =>
        (!state.historyId ||
          state.historyId.split("|").includes(a.question_id)) &&
        (!state.subject ||
          schoolGroup(
            qs.get(`${a.question_id}@${a.question_version}`)?.subject || "",
            qs.get(`${a.question_id}@${a.question_version}`)?.course || "",
          ) === state.subject),
    );
  return `${head("学習の記録", "一度の結果で決めつけず、解き直しの変化を残していきます。")}<div class="filters">${subjectFilter()}${state.historyId ? '<button data-action="clear-history">問題の絞り込みを解除</button>' : ""}<button data-action="activity">読んだ・覚えたを記録</button></div><section class="panel"><h2>解答の履歴 <small>${attempts.length}件</small></h2>${
    attempts
      .map((a) => {
        const q = qs.get(`${a.question_id}@${a.question_version}`);
        return `<article class="history-item"><small>${esc(dateLabel(a.attempted_at))} ・ ${esc(q?.subject)} / ${esc(q?.unit)} ・ 第${a.question_version}版</small><p><strong>${esc(q?.prompt || a.question_id)}</strong></p><span class="score">${a.score === null ? "未採点" : `${a.score} / ${a.max_points}`}</span> <span class="badge">${a.grading === "school" ? "学校採点" : a.grading === "self" ? "自己採点" : "未採点"}</span> ${!effective.has(a.id) ? '<span class="badge warn">訂正前</span>' : ""}<p class="prose">${esc(a.response || "回答メモなし")}</p><small>自信: ${{ sure: "あり", unsure: "不安", unknown: "未回答" }[a.confidence]} ・ ヒント${a.hint ? "あり" : "なし"} ・ ${a.seconds}秒${a.supersedes ? " ・ 採点訂正" : ""}</small><div class="source">出典 ${esc(q?.source_label)} / ページ ${esc(q?.source_page)}<br>原本ID ${esc(q?.source_id)} ・ 分析ID ${esc(q?.analysis_id)} ・ 弱点ID ${esc(q?.weakness_id)}${q?.parent_id ? `<br>親問題ID ${esc(q.parent_id)}` : ""}</div><div class="actions"><button data-action="solve" data-key="${esc(keyOf(q || { id: a.question_id, version: a.question_version }))}">解き直す</button>${effective.has(a.id) ? `<button class="quiet" data-action="correct" data-id="${a.id}">採点を訂正</button>` : ""}</div></article>`;
      })
      .join("") ||
    '<p class="empty">まだ記録がありません。最初の一問から始めましょう。</p>'
  }</section><section class="panel"><h2>解説・暗記などの学習</h2>${
    state.store.data.activities
      .slice()
      .reverse()
      .filter((a) => !state.subject || a.subject === state.subject)
      .map(
        (a) =>
          `<p>${esc(dateLabel(a.occurred_at))} ・ ${esc(a.subject)} / ${esc(a.unit)} ・ ${{ reading: "解説読了", memorization: "暗記", paper: "紙の演習", other: "その他" }[a.kind]} ・ ${a.minutes}分 <small>${esc(a.source_id)}</small></p>`,
      )
      .join("") || '<p class="muted">解答以外の学習もここに残せます。</p>'
  }</section>`;
}
function settings() {
  return `${head("設定とデータ", "学習の記録を手元に残し、問題を少しずつ追加しましょう。")}<div class="grid"><section class="panel"><h2>問題を追加する</h2><details><summary>Luna等で問題を作る</summary><p>利用するチャットでモデルを選び、この依頼文と対象資料を指定してください。作成後は原本・解答を照合してJSONを取り込みます。</p><label>問題作成の依頼文<textarea readonly rows="10">${esc(authoringBrief)}</textarea></label><button data-action="authoring-brief">依頼文を保存</button></details><p class="muted">確認済みの問題JSONを選び、内容を確認して取り込みます。既存の問題を直すときは版を増やしてください。</p><div class="callout">${state.store.demo ? "サンプルモードではこのブラウザだけに保存します。" : "取り込みを実行すると、選んだ問題文・解答・出典IDをSupabaseの本人用領域へ送信します。"}原本ファイルや氏名などの個人情報は含めず、照合済みの問題・解答を使ってください。</div><label>問題JSON<input class="file-input" id="question-file" type="file" accept="application/json,.json"></label><div id="import-preview"></div><div class="actions"><button data-action="sample-json">サンプルJSONを書き出す</button></div></section><div><section class="panel"><h2>テスト記録を追加する</h2><p>確認済み成績のJSONを読み込みます。受験日不明は空欄のまま保存し、分析では「全期間」のみに含めます。</p><label>テスト記録JSON<input id="test-record-file" type="file" accept="application/json,.json"></label><div id="test-import-preview"></div></section><section class="panel"><h2>学習データの保存</h2><p class="muted">問題・解答・学習活動・日次プランをJSONで書き出せます。Vaultへの取り込みにはPythonの import-study コマンドを使います。</p><button class="primary" data-action="export">全記録を書き出す</button><p class="chart-legend" style="margin-top:16px">未同期の記録も含みます。ファイルは個人用の場所に保管してください。書き出しだけでは独立バックアップの検証完了になりません。</p></section><section class="panel"><h2>一日の目安時間</h2><form id="budget-form"><label>目標（分）<input name="budget" type="number" min="1" max="120" value="${state.budget}" required></label><button type="submit" style="margin-top:12px">保存</button></form><p class="chart-legend" style="margin-top:12px">今日のプランは固定です。変更は次の日の作成に使われます。この端末で保持します。</p></section></div></div>`;
}
async function render(focus = false) {
  if (!state.store) return login();
  const content = {
    today,
    subjects: exercises,
    memory,
    practice: practiceScreen,
    analysis,
    history,
    test_records,
    settings,
  }[state.tab]();
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">4</span>4Study</div><nav aria-label="主なメニュー">${Object.entries(
    titles,
  )
    .map(
      ([key, title]) =>
        `<button data-action="tab" data-tab="${key}" ${state.tab === key ? 'aria-current="page"' : ""}>${title}</button>`,
    )
    .join(
      "",
    )}</nav><footer>小さな復習を、毎日の習慣に。<br>原本はObsidian Vaultへ。</footer></aside><div class="main-wrap"><header class="top"><small>${state.store.demo ? "サンプルモード · この端末に保存" : "個人用ワークスペース · Supabase"}</small><div class="status"><span class="badge ${state.store.pending.length ? "warn" : ""}">${state.store.demo ? "合成問題" : state.store.pending.length ? `未同期 ${state.store.pending.length}件` : "同期済み"}</span>${!state.store.demo ? '<button data-action="sync">同期</button>' : ""}<button data-action="logout">${state.store.demo ? "ログイン画面へ" : "ログアウト"}</button></div></header><main id="main">${content}</main></div></div>`;
  document.title = `4Study — ${titles[state.tab] || "問題を解く"}`;
  if (focus) document.querySelector("#page-title")?.focus();
}
function modal(html) {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "演習と学習記録");
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-top"><span class="badge">学習の時間</span><button type="button" data-action="close" aria-label="閉じる">閉じる</button></div>${html}</div>`;
  dialog.addEventListener("close", () => {
    dialog.remove();
    state.modal = null;
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
function gradeFields(q, old = null) {
  return `<div class="two"><label>獲得点 / ${q.max_points}点<input name="score" type="number" min="0" max="${q.max_points}" step="any" value="${old?.score ?? ""}" placeholder="空欄なら未採点"></label><label>採点方法<select name="grading"><option value="self" ${old?.grading === "self" ? "selected" : ""}>自己採点</option><option value="school" ${old?.grading === "school" ? "selected" : ""}>学校採点</option></select></label></div><label>解くときの自信<select name="confidence"><option value="unknown">未回答</option><option value="sure" ${old?.confidence === "sure" ? "selected" : ""}>自信あり</option><option value="unsure" ${old?.confidence === "unsure" ? "selected" : ""}>不安がある</option></select></label><label class="check"><input type="checkbox" name="hint" ${old?.hint ? "checked" : ""}>解答前にヒントを使った</label>`;
}
async function solve(key, old = null) {
  const q = state.store.data.questions.find(
    (q) => keyOf(q) === key && q.status === "verified",
  );
  if (!q) throw new Error("確認済みの問題が見つかりません。");
  if (!old) {
    const continuing = state.tab === "practice";
    if (continuing && !state.practice.saved) {
      const form = document.querySelector("#attempt-form");
      if (form)
        state.practiceDrafts.set(keyOf(state.practice.q), {
          html: form.innerHTML,
          values: [...form.elements]
            .filter((e) => e.name)
            .map((e) => ({
              name: e.name,
              value: e.value,
              checked: e.checked,
              type: e.type,
            })),
          started: state.practice.started,
        });
    }
    if (!continuing) state.practiceDrafts.clear();
    const from = continuing ? state.practice.from : state.tab;
    const queue = continuing
      ? state.practice.queue
      : from === "today"
        ? state.store.data.daily_sets
            .find((p) => p.day === jstDay())
            .items.map((i) => `${i.question_id}@${i.question_version}`)
        : questionList(state.store.data, state).map(keyOf);
    state.practice = {
      q,
      old: null,
      started: Date.now(),
      from,
      queue,
      saved: false,
    };
    state.tab = "practice";
    await render(true);
    const draft = state.practiceDrafts.get(key);
    if (draft) {
      const form = document.querySelector("#attempt-form");
      form.innerHTML = draft.html;
      form.classList.toggle(
        "is-grading",
        !form.querySelector("#grading").hidden,
      );
      for (const entry of draft.values) {
        const matches = [...form.elements].filter(
          (e) => e.name === entry.name && e.type === entry.type,
        );
        for (const el of matches) {
          if (el.type === "radio" || el.type === "checkbox") {
            if (el.value === entry.value) el.checked = entry.checked;
          } else el.value = entry.value;
        }
      }
      state.practice.started = draft.started;
    }
    document
      .querySelector(".practice-toolbar")
      ?.scrollIntoView({ block: "start" });
    return;
  }
  state.modal = { q, old, started: Date.now() };
  const dialog = modal(attemptForm(q, old));
  if (old) {
    dialog.querySelector("#grading").hidden = false;
    dialog.querySelector("[data-action=reveal]").hidden = true;
  }
}
function attemptForm(q, old = null) {
  const choices = q.choices?.length === 4 && !old;
  return `<h2>${esc(q.subject)} / ${esc(q.unit)}</h2><small>${q.kind === "variant" ? "類題" : "復習"} ・ ${q.minutes}分 ・ 第${q.version}版${old ? " ・ 採点訂正" : ""} ・ ${esc(originalLabels[q.original_result ?? "unknown"])}</small><p class="problem prose">${esc(q.prompt)}</p><form id="attempt-form" class="stack">${choices ? `<fieldset class="choice-list"><legend>答えを1つ選んでください</legend>${q.choices.map((c, i) => `<label class="choice"><input type="radio" name="response" value="${esc(c)}" required><span>${i + 1}. ${esc(c)}</span></label>`).join("")}</fieldset>` : `<label>自分の回答・途中式<textarea name="response" maxlength="20000" placeholder="紙で解いた場合はメモだけでも構いません。">${esc(old?.response || "")}</textarea></label>`}<button type="button" class="primary" data-action="reveal">解答・解説を確認する</button><div id="grading" hidden><div class="answer-block"><h3>解答</h3><p class="answer prose">${esc(q.answer)}</p><p id="choice-feedback" role="status"></p><h3>解答解説・考え方</h3><p class="prose">${esc(q.explanation || "解説は未登録です。出典を確認してください。")}</p></div><div class="stack">${gradeFields(q, old)}<p class="source">出典 ${esc(q.source_label)} / ${esc(q.source_page)}ページ / 問${esc(q.source_question || "未登録")}<br>原本ID ${esc(q.source_id)} ・ 分析ID ${esc(q.analysis_id)} ・ 弱点ID ${esc(q.weakness_id)}</p><button class="primary" type="submit">${old ? "訂正を記録する" : "結果を記録する"}</button></div></div><p class="error" role="alert" id="attempt-error"></p></form>`;
}
function practiceScreen() {
  const p = state.practice;
  const pos = p.queue.indexOf(keyOf(p.q));
  const next = p.queue[pos + 1];
  return `${head("問題を解く", `${p.from === "today" ? "今日の問題" : "教科別の演習"} ・ ${Math.max(1, pos + 1)} / ${Math.max(1, p.queue.length)}問`)}<div class="practice-toolbar"><button data-action="practice-back">一覧に戻る</button><small>番号で移動できます。途中の回答はこの演習中だけ保持します。</small></div><nav class="question-navigator" aria-label="問題番号">${p.queue.map((key, i) => `<button data-action="solve" data-key="${esc(key)}" ${key === keyOf(p.q) ? 'aria-current="step"' : ""}>${i + 1}${state.store.data.attempts.some((a) => `${a.question_id}@${a.question_version}` === key) ? " ✓" : ""}</button>`).join("")}</nav><section class="panel practice-sheet">${p.saved ? `<h2>結果を記録しました</h2><p class="prose">${esc(p.q.prompt)}</p><div class="answer-block"><h3>解答</h3><p class="prose">${esc(p.q.answer)}</p><h3>解答解説・考え方</h3><p class="prose">${esc(p.q.explanation || "解説は未登録です。")}</p></div><div class="actions">${next ? `<button class="primary" data-action="solve" data-key="${esc(next)}">次の問題へ</button>` : ""}<button data-action="solve" data-key="${esc(keyOf(p.q))}">この問題をもう一度</button><button data-action="memorize" data-key="${esc(keyOf(p.q))}">この問題を覚える</button><button data-action="practice-back">一覧へ戻る</button></div>` : attemptForm(p.q)}</section>`;
}
function download(value, filename) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let importRows = null;
let testImportInput = null;
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || state.busy) return;
  const action = button.dataset.action;
  try {
    state.busy = true;
    button.disabled = true;
    if (action === "authoring-brief") {
      const url = URL.createObjectURL(
        new Blob([authoringBrief], { type: "text/plain;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "4Study-question-request.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === "demo") await enter();
    else if (action === "tab") {
      state.tab = button.dataset.tab;
      state.historyId = "";
      await render(true);
    } else if (action === "school-evidence") {
      if (button.dataset.level === "overall") {
        state.schoolGroup = button.dataset.label;
        state.schoolCourse = "";
        await render();
      } else if (state.analysisSource === "tests") {
        state.tab = "test_records";
        await render(true);
      } else {
        const g = schoolSummary(state.store.data, {
          group: state.schoolGroup,
          course: state.schoolCourse,
          days: state.days,
          source: "practice",
        }).find((g) => g.label === button.dataset.label);
        if (!g?.evidence.length)
          throw new Error("この分野にはまだ採点記録がありません。");
        state.historyId = g.evidence.map((a) => a.question_id).join("|");
        state.subject = "";
        state.tab = "history";
        await render(true);
      }
    } else if (action === "test-new" || action === "test-correct") {
      state.testOld =
        action === "test-correct"
          ? state.store.data.test_results.find(
              (t) => t.id === button.dataset.id,
            )
          : null;
      modal(testDialog(state.testOld, { esc }));
    } else if (action === "logout") {
      if (!state.store.demo) {
        const { error } = await client.auth.signOut();
        if (error)
          throw new Error("ログアウトできません。接続を確認してください。");
      }
      state.generation++;
      state.subject = "";
      state.unit = "";
      state.source = "";
      state.exactOnly = false;
      state.practiceDrafts.clear();
      login();
    } else if (action === "solve") await solve(button.dataset.key);
    else if (action === "practice-back") {
      state.tab = state.practice.from;
      state.practice = null;
      await render(true);
    } else if (action === "memorize") {
      const q = state.store.data.questions.find(
        (q) => keyOf(q) === button.dataset.key,
      );
      state.subject = schoolGroup(q.subject, q.course) || "";
      state.unit = q.unit;
      state.kind = "";
      state.originalResult = "";
      state.onlyMarked = false;
      state.source = q.source_id;
      state.exactOnly = false;
      state.memorySheet = `${q.source_id} / ${q.unit}`;
      state.tab = "memory";
      state.practice = null;
      await render(true);
      document
        .querySelector(`[data-memory-key="${CSS.escape(keyOf(q))}"]`)
        ?.scrollIntoView({ block: "start" });
    } else if (action === "hide-answers") {
      for (const flip of document.querySelectorAll(
        '.sticky-answer[aria-expanded="true"]',
      )) {
        flip.setAttribute("aria-expanded", "false");
        flip.setAttribute("aria-label", "答えを表示");
        flip.querySelector(".sticky-cover").hidden = false;
        flip.querySelector(".revealed-answer").hidden = true;
        for (const mark of flip
          .closest(".recall-line")
          .querySelectorAll(".actions button"))
          mark.disabled = true;
      }
    } else if (action === "flip-blank") {
      const line = button.closest(".recall-line");
      const revealed = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(revealed));
      button.setAttribute(
        "aria-label",
        revealed
          ? `答え：${line.querySelector(".revealed-answer").textContent}。押すと隠す`
          : "答えを表示",
      );
      button.querySelector(".sticky-cover").hidden = revealed;
      line.querySelector(".revealed-answer").hidden = !revealed;
      for (const mark of line.querySelectorAll(".actions button")) {
        mark.disabled = !revealed;
        mark.dataset.keepDisabled = String(!revealed);
      }
      line.querySelector(".recall-status").textContent = "";
    } else if (action === "recall-wrong" || action === "recall-known") {
      const line = button.closest(".recall-line");
      const key = button.closest(".memory-card").dataset.memoryKey;
      const q = state.store.data.questions.find((q) => keyOf(q) === key);
      const row = {
        id: crypto.randomUUID(),
        question_id: q.id,
        question_version: q.version,
        blank_id: line.dataset.blankId,
        occurred_at: new Date().toISOString(),
        result: action === "recall-wrong" ? "wrong" : "known",
      };
      let syncError;
      try {
        await state.store.record("recall_events", row);
      } catch (e) {
        if (!state.store.data.recall_events.some((r) => r.id === row.id))
          throw e;
        syncError = e.message;
      }
      line.querySelector(".recall-count").textContent =
        `間違えた回数：${mistakeCount(state.store.data.recall_events, q, row.blank_id)}回`;
      line.querySelector(".recall-status").textContent =
        syncError || "記録しました。答えを隠して、何度でも練習できます。";
      for (const mark of line.querySelectorAll(".actions button")) {
        mark.disabled = true;
        mark.dataset.keepDisabled = "true";
      }
      const badge = document.querySelector(".status .badge");
      if (!state.store.demo) {
        badge.textContent = state.store.pending.length
          ? `未同期 ${state.store.pending.length}件`
          : "同期済み";
        badge.classList.toggle("warn", !!state.store.pending.length);
      }
    } else if (action === "close") button.closest("dialog").close();
    else if (action === "reveal") {
      const p = state.tab === "practice" ? state.practice : state.modal;
      if (p.q.choices?.length === 4 && !p.old) {
        const selected = document.querySelector("[name=response]:checked");
        if (!selected) throw new Error("答えを1つ選んでください。");
        const correct = selected.value === p.q.answer;
        document.querySelector("[name=score]").value = correct
          ? p.q.max_points
          : 0;
        document.querySelector("#choice-feedback").textContent = correct
          ? "正解です。点数を確認して記録してください。"
          : "今回は不正解です。解説を読み、点数を確認して記録してください。";
        document.querySelectorAll("[name=response]").forEach((el) => {
          el.disabled = true;
        });
        // Keep the submitted response after locking the choices.
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "response";
        input.value = selected.value;
        document.querySelector("#attempt-form").append(input);
      }
      document.querySelector("#grading").hidden = false;
      button.hidden = true;
      // Show the feedback as a new step, at the same screen position.
      document.querySelector("#attempt-form").classList.add("is-grading");
      document.querySelector("[name=score]").focus();
    } else if (action === "sync") {
      await state.store.flush();
      await state.store.load();
      await state.store.plan(jstDay(), state.budget);
      await render();
      notice("記録を同期しました。");
    } else if (action === "clear-history") {
      state.historyId = "";
      await render();
    } else if (action === "correct") {
      const a = state.store.data.attempts.find(
        (a) => a.id === button.dataset.id,
      );
      await solve(`${a.question_id}@${a.question_version}`, a);
    } else if (action === "evidence") {
      const g = stats().find((g) => g.label === button.dataset.label);
      if (!g?.evidence.length)
        throw new Error("この分野にはまだ採点記録がありません。");
      state.historyId = g.evidence.map((a) => a.question_id).join("|");
      state.tab = "history";
      await render(true);
    } else if (action === "export")
      download(state.store.export(), `4Study-${jstDay()}.json`);
    else if (action === "sample-json")
      download(
        { schema_version: 1, questions: samples },
        "4Study-sample-questions.json",
      );
    else if (action === "import-tests") {
      if (
        !document.querySelector("#test-import-consent")?.checked ||
        !testImportInput
      )
        throw new Error("保存先と内容を確認してください。");
      const rows = prepareTests(testImportInput, state.store.data.test_results);
      for (const row of rows) await state.store.record("test_results", row);
      testImportInput = null;
      await render();
      notice(
        `${rows.length}件のテスト記録を追加しました。日付不明は分析の全期間で確認できます。`,
      );
    } else if (action === "import") {
      if (!document.querySelector("#import-consent")?.checked)
        throw new Error("保存先と内容を確認してチェックしてください。");
      const count = await state.store.importQuestions(importRows);
      importRows = null;
      await render();
      notice(
        `${count}問を取り込みました。今日のセットは固定のため、教科別の演習から解けます。`,
      );
    } else if (action === "activity")
      modal(
        `<h2 style="margin-top:20px">解答以外の学習を記録</h2><form id="activity-form" class="stack"><label>教科<select name="subject" required>${options(subjects(), state.subject, "選択してください")}</select></label><label>単元<input name="unit" maxlength="100"></label><label>種類<select name="kind"><option value="reading">解説を読んだ</option><option value="memorization">暗記</option><option value="paper">紙で演習した</option><option value="other">その他</option></select></label><label>学習時間（分）<input type="number" name="minutes" min="1" max="1440" required></label><label>出典ID（任意）<input name="source_id" maxlength="200"></label><button class="primary" type="submit">学習を記録する</button><p role="alert" class="error" id="activity-error"></p></form>`,
      );
  } catch (error) {
    notice(error.message);
  } finally {
    state.busy = false;
    if (button.isConnected)
      button.disabled = button.dataset.keepDisabled === "true";
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  if (["source", "memory-sheet", "exact-only"].includes(el.id)) {
    if (el.id === "source") {
      state.source = el.value;
      state.memorySheet = "";
    }
    if (el.id === "memory-sheet") state.memorySheet = el.value;
    if (el.id === "exact-only") state.exactOnly = el.checked;
    await render();
    document.getElementById(el.id)?.focus();
    return;
  }
  if (el.id === "only-marked") {
    state.onlyMarked = el.checked;
    await render();
    document.getElementById(el.id)?.focus();
  }
  if (el.id === "original-result") {
    state.originalResult = el.value;
    await render();
    document.getElementById(el.id)?.focus();
  }
  if (el.name === "subject" && el.closest("#test-form"))
    el.closest("form").elements.course.value = el.value;
  if (["school-group", "school-course", "analysis-source"].includes(el.id)) {
    const field = {
      "school-group": "schoolGroup",
      "school-course": "schoolCourse",
      "analysis-source": "analysisSource",
    }[el.id];
    state[field] = el.value;
    if (el.id === "school-group") state.schoolCourse = "";
    await render();
    document.getElementById(el.id)?.focus();
  }
  if (["subject", "unit", "kind", "days"].includes(el.id)) {
    state[el.id] = el.id === "days" ? Number(el.value) : el.value;
    if (el.id === "subject") {
      state.unit = "";
      state.source = "";
      state.memorySheet = "";
    }
    await render();
    document.getElementById(el.id)?.focus();
  }
  if (el.id === "test-record-file") {
    testImportInput = null;
    const target = document.querySelector("#test-import-preview");
    try {
      const file = el.files[0];
      if (!file) return;
      if (file.size > 10000000)
        throw new Error("10MB以下のJSONを選んでください。");
      const input = JSON.parse(await file.text());
      const rows = prepareTests(input, state.store.data.test_results);
      testImportInput = input;
      target.innerHTML = `<p>${rows.length}件追加 / 日付不明 ${rows.filter((t) => !t.taken_on).length}件</p><ul>${rows.map((t) => `<li>${esc(t.course)}・${esc(t.exam_title)}: ${t.score ?? "未採点"}/${t.max_points} (${esc(t.taken_on || "日付不明")})</li>`).join("")}</ul><label class="check"><input type="checkbox" id="test-import-consent">内容と${state.store.demo ? "端末内" : "Supabase本人用領域への"}保存を確認しました</label><button data-action="import-tests">テスト記録を取り込む</button><p>途中で通信が切れた場合は同期後に同じJSONを再選択できます。同じIDの記録は増やしません。</p>`;
    } catch (e) {
      target.textContent = e.message;
    }
  }
  if (el.id === "question-file") {
    importRows = null;
    const target = document.querySelector("#import-preview");
    try {
      const file = el.files[0];
      if (!file) return;
      if (file.size > 10000000)
        throw new Error("10MB以下の問題JSONを選んでください。");
      const input = JSON.parse(await file.text());
      importRows = validateQuestions(input.questions ?? input);
      target.innerHTML = `<div class="callout">${importRows.length}問 / ${esc([...new Set(importRows.map((q) => q.subject))].join("・"))}<br>先頭: ${esc(importRows[0]?.prompt || "なし")}</div><label class="check"><input type="checkbox" id="import-consent">内容と${state.store.demo ? "端末内" : "Supabaseへの"}保存を確認しました</label><button class="primary" data-action="import" style="margin-top:16px">取り込みを実行する</button>`;
    } catch (e) {
      target.textContent = e.message;
    }
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const form = event.target,
    data = new FormData(form),
    button = form.querySelector("button[type=submit]");
  state.busy = true;
  if (button) button.disabled = true;
  try {
    if (form.id === "login-form") {
      const { data: auth, error } = await client.auth.signInWithPassword({
        email: data.get("email"),
        password: data.get("password"),
      });
      if (error)
        throw new Error(
          "ログインできません。メールアドレスとパスワードを確認してください。",
        );
      await enter(auth.user);
    }
    if (form.id === "attempt-form") {
      const { q, old, started } =
        state.tab === "practice" ? state.practice : state.modal;
      if (form.querySelector("#grading").hidden)
        throw new Error("解答を確認してから記録してください。");
      const raw = data.get("score").trim(),
        score = raw === "" ? null : Number(raw);
      if (
        score !== null &&
        (!Number.isFinite(score) || score < 0 || score > q.max_points)
      )
        throw new Error("配点の範囲内で得点を入力してください。");
      const row = {
        id: crypto.randomUUID(),
        question_id: q.id,
        question_version: q.version,
        attempted_at: old?.attempted_at || new Date().toISOString(),
        response: data.get("response"),
        score,
        max_points: q.max_points,
        grading: score === null ? "ungraded" : data.get("grading"),
        confidence: data.get("confidence"),
        hint: data.has("hint"),
        seconds:
          old?.seconds ??
          Math.min(86400, Math.floor((Date.now() - started) / 1000)),
        supersedes: old?.id || null,
      };
      let syncError;
      try {
        await state.store.record("attempts", row);
      } catch (e) {
        if (!state.store.data.attempts.some((a) => a.id === row.id)) throw e;
        syncError = e.message;
      }
      if (old) form.closest("dialog").close();
      else {
        state.practice.saved = true;
        state.practiceDrafts.delete(keyOf(q));
      }
      await render(true);
      notice(syncError || "学習結果を記録しました。");
    }
    if (form.id === "activity-form") {
      const row = {
        id: crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
        subject: data.get("subject"),
        unit: data.get("unit"),
        kind: data.get("kind"),
        minutes: Number(data.get("minutes")),
        source_id: data.get("source_id"),
      };
      let syncError;
      try {
        await state.store.record("activities", row);
      } catch (e) {
        if (!state.store.data.activities.some((a) => a.id === row.id)) throw e;
        syncError = e.message;
      }
      form.closest("dialog").close();
      await render();
      notice(syncError || "学習活動を記録しました。");
    }
    if (form.id === "test-form") {
      const numeric = (name) =>
        data.get(name).trim() === "" ? null : Number(data.get(name));
      const old = state.testOld;
      const row = validateTest({
        id: crypto.randomUUID(),
        exam_title: data.get("exam_title"),
        exam_kind: data.get("exam_kind"),
        taken_on: data.get("taken_on") || null,
        subject: data.get("subject"),
        course: data.get("course"),
        score: numeric("score"),
        max_points: numeric("max_points"),
        average: numeric("average"),
        rank: numeric("rank"),
        participants: numeric("participants"),
        source_id: data.get("source_id"),
        analysis_id: data.get("analysis_id"),
        memo: data.get("memo"),
        supersedes: old?.id || null,
      });
      let syncError;
      try {
        await state.store.record("test_results", row);
      } catch (e) {
        if (!state.store.data.test_results.some((t) => t.id === row.id))
          throw e;
        syncError = e.message;
      }
      form.closest("dialog").close();
      state.testOld = null;
      await render();
      notice(syncError || "テスト結果を記録しました。");
    }
    if (form.id === "budget-form") {
      state.budget = Math.min(120, Math.max(1, Number(data.get("budget"))));
      localStorage.setItem("four-study:budget", String(state.budget));
      notice("目標時間を保存しました。次の日の選定に反映します。");
    }
  } catch (e) {
    const target = form.querySelector("[role=alert]");
    if (target) target.textContent = e.message;
    else notice(e.message);
  } finally {
    state.busy = false;
    if (button?.isConnected) button.disabled = false;
  }
});
// Date rollover is refreshed when returning to the tab. The server chooses JST for cloud plans.
document.addEventListener("visibilitychange", async () => {
  if (
    !document.hidden &&
    state.store &&
    !state.busy &&
    !state.modal &&
    state.tab !== "practice"
  ) {
    try {
      await state.store.plan(jstDay(), state.budget);
      await render();
    } catch (e) {
      notice(e.message);
    }
  }
});
setInterval(async () => {
  if (
    !document.hidden &&
    state.store &&
    !state.busy &&
    !state.modal &&
    state.tab !== "practice" &&
    !state.store.data.daily_sets.some((p) => p.day === jstDay())
  ) {
    try {
      await state.store.plan(jstDay(), state.budget);
      await render();
    } catch (e) {
      notice(e.message);
    }
  }
}, 60000);
window.addEventListener("beforeunload", (event) => {
  if (
    document.querySelector("dialog textarea, #attempt-form textarea")?.value ||
    document.querySelector("#attempt-form input[type=radio]:checked")
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function bootstrap() {
  try {
    state.budget = Math.min(
      120,
      Math.max(1, Number(localStorage.getItem("four-study:budget")) || 20),
    );
    if (client) {
      const { data } = await client.auth.getUser();
      if (data.user) await enter(data.user);
      else login();
      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          state.generation++;
          document.querySelector("dialog")?.close();
          login();
        }
      });
    } else login();
  } catch (e) {
    login();
    notice(e.message);
  }
}
bootstrap();
