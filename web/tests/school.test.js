import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHOOL,
  schoolGroup,
  schoolCourse,
  schoolSummary,
  validateTest,
} from "../src/school.js";
import { samples } from "../src/sample.js";

test("all eleven independent subjects remain visible with no data; excluded subjects never become zeros", () => {
  const result = schoolSummary({
    questions: [],
    attempts: [],
    test_results: [],
  });
  assert.equal(result.length, 11);
  assert.deepEqual(
    result.map((g) => g.label),
    SCHOOL.map((g) => g.label),
  );
  assert.ok(result.every((g) => g.rate === null));
  for (const s of ["家庭", "公民", "芸術", "総合的な探究", "保健体育"])
    assert.equal(schoolGroup(s), null);
});
test("confirmed courses normalize without splitting mixed maths or losing history", () => {
  assert.equal(schoolCourse("英語", "英語コミュニケーションII"), "EC");
  assert.equal(schoolCourse("英語", "論理表現Ⅱ"), "論理表現");
  assert.equal(schoolCourse("数学", "数II"), "数II");
  assert.equal(schoolCourse("数学", "数CIII"), "数CIII");
  assert.equal(schoolCourse("数学", "数学Ⅲ"), "数学III（復習）");
  assert.equal(schoolCourse("歴史", "歴史総合"), "歴史（基礎学習）");
  assert.deepEqual(
    SCHOOL.slice(0, 2).map((g) => g.label),
    ["論理国語", "古典探究"],
  );
});
test("whole school, course and unit aggregation use the same weighted evidence", () => {
  const questions = [
    { ...samples[0], course: "数II" },
    { ...samples[0], id: "other", unit: "三角関数", course: "数II" },
  ];
  const attempts = questions.map((q, i) => ({
    id: String(i),
    question_id: q.id,
    question_version: 1,
    score: i ? 4 : 8,
    max_points: 10,
    attempted_at: "2026-10-23T00:00:00Z",
    supersedes: null,
  }));
  const data = { questions, attempts, test_results: [] };
  const now = new Date("2026-10-23T02:00:00Z");
  assert.equal(
    schoolSummary(data, { now }).find((g) => g.label === "数II").rate,
    60,
  );
  assert.deepEqual(
    schoolSummary(data, { now, group: "数II" }).map((g) => g.rate),
    [80, 40],
  );
});
test("tests are separate from exercises, weighted, nullable, corrected and date filtered", () => {
  const base = {
    id: "a",
    subject: "数学",
    course: "数CIII",
    score: 60,
    max_points: 100,
    taken_on: "2026-10-22",
    exam_title: "合成考査",
  };
  const data = {
    questions: samples,
    attempts: [],
    test_results: [
      base,
      { ...base, id: "b", score: 40, max_points: 50 },
      { ...base, id: "c", score: null },
      { ...base, id: "d", score: 70, supersedes: "a" },
    ],
  };
  const now = new Date("2026-10-23T02:00:00Z");
  const math = schoolSummary(data, { source: "tests", now }).find(
    (g) => g.label === "数CIII",
  );
  assert.equal(math.count, 2);
  assert.ok(Math.abs(math.rate - (110 / 150) * 100) < 0.001);
  assert.equal(
    schoolSummary(data, { source: "practice", now }).find(
      (g) => g.label === "数CIII",
    ).rate,
    null,
  );
  const details = schoolSummary(data, {
    source: "tests",
    group: "数CIII",
    now,
  });
  assert.equal(details.length, 1);
  assert.equal(details[0].count, 2);
});
test("test input rejects impossible marks, ranks, dates", () => {
  const row = {
    exam_title: "合成",
    exam_kind: "midterm",
    taken_on: "2026-10-22",
    exam_title: "合成考査",
    subject: "数学",
    course: "数II",
    source_id: "",
    analysis_id: "",
    memo: "",
    score: 60,
    max_points: 100,
    average: null,
    rank: null,
    participants: null,
  };
  assert.equal(validateTest(row), row);
  for (const change of [
    { score: 101 },
    { average: -1 },
    { rank: 21, participants: 20 },
    { taken_on: "2026-02-30" },
    { taken_on: "9999-01-01" },
  ])
    assert.throws(() => validateTest({ ...row, ...change }));
});

test("language classes remain independent and PE results are excluded", () => {
  const courses = [
    "論理国語",
    "古典探究",
    "英語コミュニケーションII",
    "論理表現II",
    "保健",
  ];
  const questions = courses.map((course, i) => ({
    ...samples[0],
    id: `separate-${i}`,
    subject: i < 2 ? "国語" : i < 4 ? "英語" : "保健体育",
    course,
  }));
  const attempts = questions.map((q, i) => ({
    id: String(i),
    question_id: q.id,
    question_version: 1,
    score: i + 5,
    max_points: 10,
    attempted_at: "2026-10-23T00:00:00Z",
  }));
  const rows = schoolSummary(
    { questions, attempts },
    { now: new Date("2026-10-23T02:00:00Z") },
  );
  for (const [label, rate] of [
    ["論理国語", 50],
    ["古典探究", 60],
    ["EC", 70],
    ["論理表現", 80],
  ])
    assert.equal(rows.find((g) => g.label === label).rate, rate);
  assert.ok(
    !rows.some((g) => ["国語", "英語", "保健体育", "保健"].includes(g.label)),
  );
});
