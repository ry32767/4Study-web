export const SCHEMA_VERSION = 1;
export const keyOf = (q) => `${q.id}@${q.version}`;
export const jstDay = (date = new Date()) =>
  new Date(+date + 9 * 3600000).toISOString().slice(0, 10);
export function activeAttempts(attempts) {
  const superseded = new Set(attempts.map((a) => a.supersedes).filter(Boolean));
  return attempts.filter((a) => !superseded.has(a.id));
}
export function latestByQuestion(attempts) {
  const result = new Map();
  for (const a of activeAttempts(attempts).sort(
    (a, b) =>
      a.attempted_at.localeCompare(b.attempted_at) || a.id.localeCompare(b.id),
  )) {
    result.set(a.question_id, a);
  }
  return result;
}
export function summarize(
  questions,
  attempts,
  { days = 30, subject = "", kind = "", now = new Date() } = {},
) {
  const eligible = questions.filter(
    (q) => (!subject || q.subject === subject) && (!kind || q.kind === kind),
  );
  const all = new Map(eligible.map((q) => [keyOf(q), q]));
  const cutoff = days ? +now - days * 86400000 : -Infinity;
  const valid = activeAttempts(attempts).filter(
    (a) =>
      a.score !== null &&
      +new Date(a.attempted_at) >= cutoff &&
      +new Date(a.attempted_at) <= +now &&
      all.has(`${a.question_id}@${a.question_version}`),
  );
  const latest = latestByQuestion(valid);
  const groups = new Map();
  for (const q of eligible) {
    const label = subject ? q.unit : q.subject;
    if (!groups.has(label))
      groups.set(label, {
        label,
        score: 0,
        max: 0,
        count: 0,
        eventCount: 0,
        last: null,
        evidence: [],
      });
  }
  for (const a of valid) {
    const q = all.get(`${a.question_id}@${a.question_version}`);
    groups.get(subject ? q.unit : q.subject).eventCount++;
  }
  for (const a of latest.values()) {
    const q = all.get(`${a.question_id}@${a.question_version}`);
    const g = groups.get(subject ? q.unit : q.subject);
    g.score += a.score;
    g.max += a.max_points;
    g.count++;
    g.last = !g.last || a.attempted_at > g.last ? a.attempted_at : g.last;
    g.evidence.push(a);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    rate: g.max ? (g.score / g.max) * 100 : null,
  }));
}
export function dueFor(question, attempts) {
  const relevant = activeAttempts(attempts)
    .filter((a) => a.question_id === question.id)
    .sort((a, b) => a.attempted_at.localeCompare(b.attempted_at));
  const last = relevant.at(-1);
  if (!last) return { date: "1970-01-01", reason: "はじめての確認" };
  let streak = 0;
  for (const a of relevant.slice().reverse()) {
    if (a.score === null || a.score < a.max_points || a.hint) break;
    streak++;
  }
  const days = streak >= 3 ? 14 : streak === 2 ? 7 : streak === 1 ? 3 : 1;
  return {
    date: jstDay(new Date(+new Date(last.attempted_at) + days * 86400000)),
    reason:
      last.score === null
        ? "採点の確認"
        : last.score < last.max_points
          ? "前回のつまずきを復習"
          : "定着を確認",
  };
}
export function selectDaily(questions, attempts, day = jstDay(), budget = 20) {
  const versions = new Map();
  for (const q of questions.filter((q) => q.status === "verified")) {
    if (!versions.has(q.id) || versions.get(q.id).version < q.version)
      versions.set(q.id, q);
  }
  const candidates = [...versions.values()]
    .map((q) => ({ q, ...dueFor(q, attempts) }))
    .filter((c) => c.date <= day)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.q.id.localeCompare(b.q.id),
    );
  const perSubject = new Map();
  for (const c of candidates) {
    c.rank = perSubject.get(c.q.subject) || 0;
    perSubject.set(c.q.subject, c.rank + 1);
  }
  candidates.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.date.localeCompare(b.date) ||
      a.q.id.localeCompare(b.q.id),
  );
  const items = [],
    families = new Set();
  let used = 0;
  for (const c of candidates) {
    const family = c.q.parent_id || c.q.id;
    if (families.has(family) || used + c.q.minutes > budget) continue;
    items.push({
      question_id: c.q.id,
      question_version: c.q.version,
      reason: c.reason,
    });
    families.add(family);
    used += c.q.minutes;
  }
  return { day, budget, algorithm: 1, items };
}
export function validateQuestions(input) {
  if (!Array.isArray(input) || input.length > 2000)
    throw new Error("問題は2000件以下の配列にしてください。");
  const ids = new Set();
  const fields = [
    "id",
    "subject",
    "course",
    "unit",
    "prompt",
    "answer",
    "explanation",
    "source_id",
    "source_label",
    "analysis_id",
    "weakness_id",
    "batch",
  ];
  return input.map((q) => {
    if (
      !q ||
      fields.some((f) => typeof q[f] !== "string" || q[f].length > 20000) ||
      !/^[\w-]{1,100}$/.test(q.id) ||
      !q.subject.trim() ||
      !q.unit.trim() ||
      !q.prompt.trim() ||
      !q.answer.trim()
    )
      throw new Error("問題の必須項目が不足しています。");
    if (
      !Number.isInteger(q.version) ||
      q.version < 1 ||
      !Number.isFinite(q.max_points) ||
      q.max_points <= 0 ||
      q.max_points > 1000 ||
      !Number.isInteger(q.minutes) ||
      q.minutes < 1 ||
      q.minutes > 120
    )
      throw new Error("版・配点・目安時間が不正です。");
    if (
      !["review", "variant"].includes(q.kind) ||
      !["verified", "needs_review"].includes(q.status)
    )
      throw new Error("問題種別・確認状態が不正です。");
    if (q.kind === "variant" && (!q.parent_id || !q.weakness_id))
      throw new Error("類題には親問題IDと弱点IDが必要です。");
    if (q.parent_id != null && !/^[\w-]{1,100}$/.test(q.parent_id))
      throw new Error("親問題IDが不正です。");
    if (typeof q.source_page !== "string" || q.source_page.length > 100)
      throw new Error("出典ページが不正です。");
    if (ids.has(keyOf(q))) throw new Error("同じ問題・版が重複しています。");
    ids.add(keyOf(q));
    const choices = q.choices ?? [];
    const blanks = q.blanks ?? [];
    const original_result = q.original_result ?? "unknown";
    const source_question = q.source_question ?? "";
    const source_fidelity = q.source_fidelity ?? "unverified";
    if (
      !["exact", "adapted", "unverified"].includes(source_fidelity) ||
      (source_fidelity === "exact" &&
        (q.kind !== "review" ||
          !q.source_id.trim() ||
          !source_question.trim() ||
          !q.source_page.trim()))
    )
      throw new Error(
        "原文照合済み問題には原本ID・ページ・問題番号と復習種別が必要です。",
      );
    if (
      !Array.isArray(choices) ||
      ![0, 4].includes(choices.length) ||
      choices.some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 20000,
      ) ||
      new Set(choices).size !== choices.length ||
      (choices.length && !choices.includes(q.answer))
    )
      throw new Error(
        "4択には重複しない4つの選択肢と、そのいずれかに一致する解答が必要です。",
      );
    if (
      !["correct", "incorrect", "partial", "ungraded", "unknown"].includes(
        original_result,
      ) ||
      typeof source_question !== "string" ||
      source_question.length > 100
    )
      throw new Error("元テストの正誤・問題番号が不正です。");
    if (
      !Array.isArray(blanks) ||
      blanks.length > 100 ||
      blanks.some(
        (b) =>
          !b ||
          !/^[\w-]{1,100}$/.test(b.id) ||
          ["before", "answer", "after"].some(
            (f) => typeof b[f] !== "string" || b[f].length > 20000,
          ) ||
          !b.answer.trim(),
      ) ||
      new Set(blanks.map((b) => b.id)).size !== blanks.length
    )
      throw new Error("穴埋めには一意の箇所ID・前後の文・答えが必要です。");
    return Object.fromEntries(
      [
        ...fields,
        "version",
        "max_points",
        "minutes",
        "kind",
        "status",
        "parent_id",
        "source_page",
      ]
        .map((f) => [f, q[f] ?? null])
        .concat(
          Object.entries({
            choices,
            blanks: blanks.map(({ id, before, answer, after }) => ({
              id,
              before,
              answer,
              after,
            })),
            original_result,
            source_question,
            source_fidelity,
          }),
        ),
    );
  });
}
