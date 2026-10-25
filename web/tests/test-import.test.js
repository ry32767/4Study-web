import test from "node:test";
import assert from "node:assert/strict";
import { prepareTests } from "../src/test-import.js";
import { schoolSummary, validateTest } from "../src/school.js";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  exam_title: "合成テスト",
  exam_kind: "midterm",
  taken_on: null,
  subject: "英語",
  course: "EC II",
  score: 30,
  max_points: 50,
  average: null,
  rank: null,
  participants: null,
  source_id: "SYNTHETIC",
  analysis_id: "SYNTHETIC",
  memo: "",
  supersedes: null,
};
test("unknown dates are preserved and only enter all-time analysis", () => {
  assert.equal(validateTest(row).taken_on, null);
  const data = { questions: [], attempts: [], test_results: [row] };
  assert.equal(
    schoolSummary(data, { source: "tests", days: 30 }).find(
      (g) => g.label === "EC",
    ).rate,
    null,
  );
  const full = schoolSummary(data, { source: "tests", days: 0 }).find(
    (g) => g.label === "EC",
  );
  assert.equal(full.rate, 60);
  assert.equal(full.last, null);
  assert.throws(() => validateTest({ ...row, taken_on: "2026-02-30" }));
});
test("test import strips owner IDs, skips identical records and rejects conflicts before writes", () => {
  const input = {
    schema_version: 1,
    test_results: [{ ...row, user_id: "other-user" }],
  };
  assert.equal(prepareTests(input)[0].user_id, undefined);
  assert.deepEqual(prepareTests(input, [row]), []);
  assert.throws(() => prepareTests(input, [{ ...row, score: 20 }]));
  assert.throws(() => prepareTests({ ...input, test_results: [row, row] }));
  assert.throws(() =>
    prepareTests({ ...input, test_results: [{ ...row, score: 51 }] }),
  );
});
