import { activeAttempts, jstDay } from "./core.js";

// Confirmed personal scope. Candidate axes do not imply completed study.
export const SCHOOL = [
  "論理国語",
  "古典探究",
  "数II",
  "数CIII",
  "EC",
  "論理表現",
  "物理",
  "化学",
  "地理",
  "歴史（基礎学習）",
  "情報",
].map((label) => ({ label, courses: [] }));
const normalized = (v = "") =>
  v.normalize("NFKC").replaceAll(" ", "").toUpperCase();
const excluded = (s) =>
  /公民|公共|倫理|政治|家庭|芸術|音楽|美術|書道|保健|体育|総合.*探究/.test(s);
function family(value) {
  const s = normalized(value);
  if (/論理国語|古典|国語|古文|漢文/.test(s)) return "国語";
  if (/論理表現|EC|コミュニケーション|英語/.test(s)) return "英語";
  if (/数学|^数[IABC]/.test(s)) return "数学";
  if (/物理|化学|理科/.test(s)) return "理科";
  return null;
}
export function schoolGroup(subject, course = "") {
  const raw = normalized(subject),
    c = normalized(course),
    s = c || raw;
  if (excluded(raw) || excluded(c)) return null;
  for (const name of ["論理国語", "古典探究", "論理表現", "情報"])
    if (s.includes(name) || raw.includes(name)) return name;
  if (/EC|コミュニケーション|英コミ/.test(s + raw)) return "EC";
  if (/C.*III|III.*C/.test(s)) return "数CIII";
  if (/^(数学|数)II$/.test(s)) return "数II";
  const math = s.match(/^(?:数学|数)(III|I|A|B|C)$/);
  if (math) return `数学${math[1]}（復習）`;
  for (const name of ["物理", "化学", "地理"])
    if (s.includes(name) || raw.includes(name)) return name;
  if (/歴史|日本史|世界史/.test(s + raw)) return "歴史（基礎学習）";
  if (SCHOOL.some((g) => normalized(g.label) === s))
    return SCHOOL.find((g) => normalized(g.label) === s).label;
  if (family(subject)) return `${family(subject)}（科目未確認）`;
  return null;
}
export function schoolCourse(subject, course) {
  return schoolGroup(subject, course);
}
export function schoolSummary(
  data,
  {
    group = "",
    course = "",
    source = "practice",
    days = 30,
    kind = "",
    now = new Date(),
  } = {},
) {
  const groups = new Map();
  const seed = !group
    ? SCHOOL.map((g) => g.label)
    : !course
      ? SCHOOL.find((g) => g.label === group)?.courses || []
      : [];
  const ensure = (label) => {
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
    return groups.get(label);
  };
  seed.forEach(ensure);
  const cutoff = days ? +now - days * 86400000 : -Infinity;
  const within = (time) => +new Date(time) >= cutoff && +new Date(time) <= +now;
  const dimension = (subject, rawCourse, unit) => {
    const g = schoolGroup(subject, rawCourse),
      c = schoolCourse(subject, rawCourse);
    if (!g || (group && group !== g) || (course && course !== c)) return null;
    return !group ? g : unit || "単元未分類";
  };
  const add = (label, score, max, time, evidence) => {
    const g = ensure(label);
    g.score += score;
    g.max += max;
    g.count++;
    if (time) g.last = !g.last || time > g.last ? time : g.last;
    g.evidence.push(evidence);
  };
  if (source === "tests") {
    for (const t of activeAttempts(data.test_results || [])) {
      const label = dimension(t.subject, t.course, t.exam_title);
      if (label === null) continue;
      ensure(label);
      if (t.score === null) continue;
      if (t.taken_on ? !within(`${t.taken_on}T00:00:00+09:00`) : days !== 0)
        continue;
      add(
        label,
        t.score,
        t.max_points,
        t.taken_on ? `${t.taken_on}T00:00:00+09:00` : null,
        t,
      );
      ensure(label).eventCount++;
    }
  } else {
    const qs = new Map(data.questions.map((q) => [`${q.id}@${q.version}`, q]));
    for (const q of data.questions.filter((q) => !kind || q.kind === kind)) {
      const label = dimension(q.subject, q.course, q.unit);
      if (label !== null) ensure(label);
    }
    const latest = new Map();
    for (const a of activeAttempts(data.attempts)
      .slice()
      .sort(
        (a, b) =>
          a.attempted_at.localeCompare(b.attempted_at) ||
          a.id.localeCompare(b.id),
      )) {
      const q = qs.get(`${a.question_id}@${a.question_version}`);
      if (
        !q ||
        a.score === null ||
        !within(a.attempted_at) ||
        (kind && q.kind !== kind)
      )
        continue;
      const label = dimension(q.subject, q.course, q.unit);
      if (label === null) continue;
      ensure(label).eventCount++;
      latest.set(a.question_id, { a, label });
    }
    for (const { a, label } of latest.values())
      add(label, a.score, a.max_points, a.attempted_at, a);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    rate: g.max ? (g.score / g.max) * 100 : null,
  }));
}
export function validateTest(row) {
  const text = (f, max, required = false) =>
    typeof row[f] === "string" &&
    row[f].length <= max &&
    (!required || row[f].trim());
  if (
    !text("exam_title", 200, true) ||
    !text("subject", 100, true) ||
    !text("course", 100, true) ||
    !text("source_id", 200) ||
    !text("analysis_id", 200) ||
    !text("memo", 4000)
  )
    throw new Error("テスト名・教科・科目・記録項目を確認してください。");
  if (
    family(row.course) &&
    family(row.subject) &&
    family(row.course) !== family(row.subject)
  )
    throw new Error("選んだ教科と学校の科目名が一致していません。");
  if (
    row.taken_on !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(row.taken_on) ||
      Number.isNaN(Date.parse(row.taken_on)) ||
      new Date(row.taken_on).toISOString().slice(0, 10) !== row.taken_on ||
      row.taken_on > jstDay())
  )
    throw new Error("受験日は今日以前の有効な日付にしてください。");
  if (!["midterm", "final", "quiz", "mock", "other"].includes(row.exam_kind))
    throw new Error("テスト種別が不正です。");
  if (
    !Number.isFinite(row.max_points) ||
    row.max_points <= 0 ||
    row.max_points > 10000 ||
    (row.score !== null &&
      (!Number.isFinite(row.score) ||
        row.score < 0 ||
        row.score > row.max_points)) ||
    (row.average !== null &&
      (!Number.isFinite(row.average) ||
        row.average < 0 ||
        row.average > row.max_points))
  )
    throw new Error("得点・平均点は満点の範囲で記録してください。");
  if (
    (row.rank !== null && (!Number.isInteger(row.rank) || row.rank < 1)) ||
    (row.participants !== null &&
      (!Number.isInteger(row.participants) || row.participants < 1)) ||
    (row.rank !== null &&
      row.participants !== null &&
      row.rank > row.participants)
  )
    throw new Error("順位・受験者数を確認してください。");
  if (
    SCHOOL.some((g) => g.label === row.subject) &&
    schoolGroup(row.subject, row.course) !== row.subject
  )
    throw new Error("選んだ教科と学校の科目名を確認してください。");
  return row;
}
