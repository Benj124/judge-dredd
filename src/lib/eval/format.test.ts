import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatOverall,
  formatScoreOnScale,
  passIcon,
  passLabel,
  passTone,
  scalePercent,
} from "./format";
import type { Verdict } from "./types";

const sample: Verdict = {
  rubricId: "default",
  rubricVersion: "1",
  scores: [
    { id: "accuracy", score: 2, rationale: "off" },
    { id: "faithfulness", score: 5, rationale: "grounded" },
    { id: "completeness", score: 5, rationale: "full" },
    { id: "clarity", score: 4, rationale: "clear" },
  ],
  overall: 4,
  passed: true,
  rationale: "Mostly solid, one accuracy miss.",
};

test("formatOverall prints two decimal places from a real verdict overall", () => {
  assert.equal(formatOverall(sample.overall), "4.00");
  assert.equal(formatOverall(4.25), "4.25");
  assert.equal(formatOverall(Number.NaN), "—");
});

test("passLabel maps verdict.passed to the results badge copy", () => {
  assert.equal(passLabel(sample.passed), "Pass");
  assert.equal(passLabel(false), "Fail");
  assert.equal(passLabel(null), "No rule");
});

test("passTone and passIcon map verdict.passed for scanable badges", () => {
  assert.equal(passTone(true), "pass");
  assert.equal(passTone(false), "fail");
  assert.equal(passTone(null), "neutral");
  assert.equal(passIcon(true), "✓");
  assert.equal(passIcon(false), "✕");
  assert.equal(passIcon(null), "–");
});

test("scalePercent places a criterion score on its rubric scale", () => {
  assert.equal(scalePercent(1, 1, 5), 0);
  assert.equal(scalePercent(5, 1, 5), 100);
  assert.equal(scalePercent(3, 1, 5), 50);
  assert.equal(scalePercent(sample.scores[3].score, 1, 5), 75);
});

test("formatScoreOnScale labels a criterion for the results panel", () => {
  assert.equal(formatScoreOnScale(sample.scores[0].score, 5), "2.00 / 5");
});
