import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateOverall, overallPassed } from "./aggregate";
import type { Rubric } from "./types";

const weightedRubric: Rubric = {
  id: "weighted",
  version: "1",
  name: "weighted",
  description: "",
  overallPassRule: "weighted_average",
  overallPassThreshold: 4,
  criteria: [
    {
      id: "a",
      name: "A",
      description: "",
      scale: { min: 1, max: 5 },
      weight: 1,
    },
    {
      id: "b",
      name: "B",
      description: "",
      scale: { min: 1, max: 5 },
      weight: 3,
    },
  ],
};

const allMustPassRubric: Rubric = {
  ...weightedRubric,
  id: "amp",
  overallPassRule: "all_must_pass",
  criteria: weightedRubric.criteria.map((criterion) => ({
    ...criterion,
    passThreshold: 3,
  })),
};

test("weighted average is the weight-normalized sum", () => {
  const overall = aggregateOverall(weightedRubric, { a: 2, b: 5 });
  assert.equal(overall, 4.25);
  assert.equal(overallPassed(weightedRubric, { a: 2, b: 5 }, overall), true);
  assert.equal(
    overallPassed(weightedRubric, { a: 1, b: 1 }, aggregateOverall(weightedRubric, { a: 1, b: 1 })),
    false,
  );
});

test("all_must_pass requires every criterion at or above its threshold", () => {
  assert.equal(overallPassed(allMustPassRubric, { a: 3, b: 5 }, 4), true);
  assert.equal(overallPassed(allMustPassRubric, { a: 2, b: 5 }, 4), false);
});
