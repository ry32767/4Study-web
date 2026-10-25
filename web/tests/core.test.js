import test from "node:test";
import assert from "node:assert/strict";
import {
  jstDay,
  summarize,
  selectDaily,
  dueFor,
  validateQuestions,
  activeAttempts,
} from "../src/core.js";
import { samples } from "../src/sample.js";

const now = new Date("2026-10-23T01:00:00Z");
const q = samples[0];
function a(id, score, date = "2026-10-22T01:00:00Z", extra = {}) {
  return {
    id,
    question_id: q.id,
    question_version: 1,
    attempted_at: date,
    score,
    max_points: 10,
    hint: false,
    supersedes: null,
    ...extra,
  };
}
test("JST rolls over nine hours ahead of UTC", () => {
  assert.equal(jstDay(new Date("2026-10-22T15:00:00Z")), "2026-10-23");
  assert.equal(jstDay(new Date("2026-10-22T14:59:59Z")), "2026-10-22");
});
test("partial credit is weighted by points, ungraded and unseen are excluded", () => {
  const qs = [
    { ...q, max_points: 100 },
    { ...q, id: "second", max_points: 50 },
    samples[2],
  ];
  const rows = [
    a("a", 60, undefined, { max_points: 100 }),
    a("b", 40, undefined, { question_id: "second", max_points: 50 }),
    a("c", null, undefined, { question_id: samples[2].id }),
  ];
  const result = summarize(qs, rows, { now });
  assert.ok(Math.abs(result[0].rate - 66.6666667) < 0.001);
  assert.equal(result[0].count, 2);
  assert.equal(result[1].rate, null);
});
test("latest graded attempt per question, corrections and all-period filters", () => {
  const rows = [
    a("a", 0, "2026-08-01T01:00:00Z"),
    a("b", 5),
    a("c", 8, undefined, { supersedes: "b" }),
    a("d", null, "2026-10-23T00:00:00Z"),
  ];
  assert.equal(activeAttempts(rows).length, 3);
  const result = summarize([q], rows, { now });
  assert.equal(result[0].rate, 80);
  assert.equal(result[0].eventCount, 1);
  assert.equal(summarize([q], rows, { now, days: 0 })[0].eventCount, 2);
});
test("daily selection is deterministic, fair, limited and excludes unverified/family duplicates", () => {
  const selected = selectDaily(
    [
      ...samples,
      { ...q, version: 2 },
      { ...q, id: "bad", status: "needs_review" },
    ],
    [],
    "2026-10-23",
    20,
  );
  assert.deepEqual(
    selected,
    selectDaily(
      [
        ...samples,
        { ...q, version: 2 },
        { ...q, id: "bad", status: "needs_review" },
      ],
      [],
      "2026-10-23",
      20,
    ),
  );
  assert.equal(selected.items.length, 6);
  assert.equal(new Set(selected.items.map((i) => i.question_id)).size, 6);
  assert.ok(!selected.items.some((i) => i.question_id === "bad"));
  assert.equal(
    selected.items.find((i) => i.question_id === q.id).question_version,
    2,
  );
});
test("wrong answers return tomorrow and successful spaced practice advances", () => {
  assert.equal(dueFor(q, [a("a", 0)]).date, "2026-10-23");
  assert.equal(dueFor(q, [a("a", 10)]).date, "2026-10-25");
  assert.equal(
    dueFor(q, [a("a", 10, "2026-10-18T00:00:00Z"), a("b", 10)]).date,
    "2026-10-29",
  );
  assert.equal(selectDaily([q], [a("a", 10)], "2026-10-23").items.length, 0);
});
test("question import rejects path tricks, duplicate versions and invalid point scales", () => {
  assert.equal(validateQuestions(samples).length, samples.length);
  for (const invalid of [
    [q, q],
    [{ ...q, id: "../escape" }],
    [{ ...q, max_points: Infinity }],
    [{ ...q, kind: "variant", parent_id: null }],
  ])
    assert.throws(() => validateQuestions(invalid));
});
