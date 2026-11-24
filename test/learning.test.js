import test from "node:test";
import assert from "node:assert/strict";
import {
  localDay,
  nextReview,
  remaining,
  requiredFinal,
  revisionSchedule,
  weightedAverage,
} from "../src/learning.js";
test("daily limits distinguish Free and fair-use Pro and reset by date", () => {
  const usage = { "2026-11-22": { quiz: 5, tutor: 9 } };
  assert.equal(remaining(usage, "quiz", false, "2026-11-22"), 0);
  assert.equal(remaining(usage, "tutor", false, "2026-11-22"), 1);
  assert.equal(remaining(usage, "quiz", true, "2026-11-22"), 95);
  assert.equal(remaining(usage, "tutor", true, "2026-11-22"), 291);
  assert.equal(remaining(usage, "quiz", false, "2026-11-23"), 5);
});
test("review intervals preserve daily Free review and expand with Pro ratings", () => {
  assert.equal(nextReview(10, "again", true), 0);
  assert.equal(nextReview(10, "easy", false), 1);
  assert.equal(nextReview(10, "hard", true), 12);
  assert.equal(nextReview(10, "good", true), 18);
  assert.equal(nextReview(10, "easy", true), 25);
});
test("grade scenarios normalize weights and calculate required final scores", () => {
  const grades = [
    { score: 80, weight: 30 },
    { score: 90, weight: 40 },
  ];
  assert.ok(Math.abs(weightedAverage(grades) - 85.714285714) < 0.0001);
  assert.equal(requiredFinal(grades, 90, 30), 100);
  assert.equal(requiredFinal(grades, 90, 0), null);
  assert.equal(weightedAverage([]), null);
});
test("revision prioritizes weaker subjects and never schedules after exams", () => {
  const subjects = [{ id: "bio", name: "Biology", exam: "2026-11-25" }];
  const weak = revisionSchedule(
    subjects,
    [{ subject: "bio", correct: 1, total: 5 }],
    "2026-11-22",
  );
  assert.deepEqual(
    weak.map((x) => x.date),
    ["2026-11-22", "2026-11-23", "2026-11-25"],
  );
  assert.ok(weak.every((x) => x.minutes === 30 && !x.done));
  const strong = revisionSchedule(
    subjects,
    [{ subject: "bio", correct: 5, total: 5 }],
    "2026-11-22",
  );
  assert.deepEqual(
    strong.map((x) => x.date),
    ["2026-11-23"],
  );
  assert.equal(localDay(new Date(2026, 0, 2)), "2026-01-02");
});
