import test from "node:test";
import assert from "node:assert/strict";
import { validateQuestions, selectDaily } from "../src/core.js";
import { samples } from "../src/sample.js";
import {
  questionList,
  recallBlanks,
  mistakeCount,
  practiceMistakes,
} from "../src/practice.js";

test("all original outcomes remain available to repeat and daily selection", () => {
  const questions = [
    "correct",
    "incorrect",
    "partial",
    "ungraded",
    "unknown",
  ].map((r, i) => ({ ...samples[0], id: `q-${i}`, original_result: r }));
  assert.equal(questionList({ questions }, {}).length, 5);
  assert.equal(
    questionList({ questions }, { originalResult: "correct" })[0].id,
    "q-0",
  );
  assert.equal(selectDaily(questions, [], "2026-10-25", 20).items.length, 5);
  assert.equal(
    questionList(
      { questions: [...questions, { ...questions[0], version: 2 }] },
      {},
    ).length,
    5,
  );
});
test("recall counts are per blank and version, independent of grades and successes", () => {
  const q = samples[4];
  const base = {
    question_id: q.id,
    question_version: 1,
    blank_id: "relative",
    result: "wrong",
  };
  const events = [
    base,
    base,
    { ...base, result: "known" },
    { ...base, blank_id: "another" },
    { ...base, question_version: 2 },
  ];
  assert.equal(mistakeCount(events, q, "relative"), 2);
  assert.equal(mistakeCount(events, q), 3);
  assert.equal(practiceMistakes([], q), 0);
  assert.equal(recallBlanks(samples[0])[0].id, "answer");
  assert.equal(recallBlanks(q)[0].id, "relative");
});
test("old question JSON defaults and malformed choices/blanks are validated", () => {
  const q = samples[0];
  assert.equal(validateQuestions([q])[0].original_result, "unknown");
  for (const extra of [
    { choices: ["a", "b"] },
    { choices: ["a", "a", "b", "c"] },
    { choices: ["a", "b", "c", "d"] },
    { original_result: "wrong" },
    { blanks: [{ id: "../x", before: "", answer: "a", after: "" }] },
    { blanks: [{ id: "x", before: "", answer: " ", after: "" }] },
  ])
    assert.throws(() => validateQuestions([{ ...q, ...extra }]));
  assert.equal(validateQuestions(samples)[4].choices.length, 4);
});

test("exact copies require provenance and stay separate from adapted questions", () => {
  const q = {
    ...samples[0],
    source_question: "1(1)",
    source_page: "1",
    source_fidelity: "exact",
  };
  assert.equal(validateQuestions([q])[0].source_fidelity, "exact");
  for (const extra of [
    { source_page: "" },
    { source_question: "" },
    { source_id: "" },
    { kind: "variant" },
    { source_fidelity: "guess" },
  ])
    assert.throws(() => validateQuestions([{ ...q, ...extra }]));
  assert.equal(
    questionList(
      { questions: [q, { ...q, id: "adapted", source_fidelity: "adapted" }] },
      { exactOnly: true },
    ).length,
    1,
  );
  assert.equal(
    questionList({ questions: [q] }, { source: "missing" }).length,
    0,
  );
});
