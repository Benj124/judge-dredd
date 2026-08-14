import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateOverall } from "./aggregate";
import { DEFAULT_JUDGE_MODEL, isFrontierModel } from "./models";
import { evaluatePointwise } from "./pipeline";
import { DEFAULT_RUBRIC, getRubric } from "./rubrics";
import type { JudgeComplete } from "./types";

function fakeJson(body: unknown): JudgeComplete {
  return async () => JSON.stringify(body);
}

test("empty subject is rejected before any model call", async () => {
  let calls = 0;
  const complete: JudgeComplete = async () => {
    calls += 1;
    return "{}";
  };

  const empty = await evaluatePointwise(
    { subject: "", rubricId: "default" },
    { complete },
  );
  const blank = await evaluatePointwise(
    { subject: "   ", rubricId: "default" },
    { complete },
  );

  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.code, "precheck");
    assert.match(empty.error, /subject/i);
  }
  assert.equal(blank.ok, false);
  assert.equal(calls, 0);
});

test("default rubric is selectable and covers required criteria", () => {
  const rubric = getRubric("default");
  assert.ok(rubric);
  assert.equal(rubric, DEFAULT_RUBRIC);
  const ids = rubric.criteria.map((criterion) => criterion.id);
  assert.deepEqual(ids, [
    "accuracy",
    "faithfulness",
    "completeness",
    "clarity",
  ]);
});

test("valid fake judge JSON becomes an in-scale verdict whose overall matches the combine rule", async () => {
  const scores = [
    { id: "accuracy", score: 2, rationale: "off" },
    { id: "faithfulness", score: 5, rationale: "grounded" },
    { id: "completeness", score: 5, rationale: "full" },
    { id: "clarity", score: 4, rationale: "clear" },
  ];
  const result = await evaluatePointwise(
    {
      subject: "The capital of France is Paris.",
      context: "What is the capital of France?",
      rubricId: "default",
    },
    {
      complete: fakeJson({
        scores,
        rationale: "Mostly solid, one accuracy miss.",
      }),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const byId = Object.fromEntries(
    result.verdict.scores.map((score) => [score.id, score.score]),
  );
  for (const criterion of DEFAULT_RUBRIC.criteria) {
    const score = byId[criterion.id];
    assert.ok(score >= criterion.scale.min && score <= criterion.scale.max);
  }
  assert.equal(
    result.verdict.overall,
    aggregateOverall(DEFAULT_RUBRIC, byId),
  );
  assert.equal(result.verdict.overall, 4);
  assert.equal(result.verdict.passed, true);
  assert.equal(result.verdict.rationale, "Mostly solid, one accuracy miss.");
  assert.equal(result.verdict.rubricId, "default");
});

test("pipeline parses fenced judge JSON through the shipped parse path", async () => {
  const scores = DEFAULT_RUBRIC.criteria.map((criterion) => ({
    id: criterion.id,
    score: 3,
    rationale: "mid",
  }));
  const result = await evaluatePointwise(
    { subject: "hello", rubricId: "default" },
    {
      complete: async () =>
        "```json\n" +
        JSON.stringify({ scores, rationale: "Fenced judge output." }) +
        "\n```",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.verdict.rationale, "Fenced judge output.");
  assert.equal(result.verdict.overall, 3);
});

test("missing criterion scores fail post-checks", async () => {
  const result = await evaluatePointwise(
    { subject: "hello", rubricId: "default" },
    {
      complete: fakeJson({
        scores: [{ id: "accuracy", score: 4, rationale: "ok" }],
        rationale: "incomplete",
      }),
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "postcheck");
    assert.match(result.error, /Missing score/i);
  }
});

test("out-of-range scores fail post-checks", async () => {
  const result = await evaluatePointwise(
    { subject: "hello", rubricId: "default" },
    {
      complete: fakeJson({
        scores: [
          { id: "accuracy", score: 99, rationale: "nope" },
          { id: "faithfulness", score: 4, rationale: "ok" },
          { id: "completeness", score: 4, rationale: "ok" },
          { id: "clarity", score: 4, rationale: "ok" },
        ],
        rationale: "bad scale",
      }),
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "postcheck");
    assert.match(result.error, /outside/i);
  }
});

test("default judge model is a non-frontier id", () => {
  assert.equal(isFrontierModel(DEFAULT_JUDGE_MODEL), false);
  assert.equal(isFrontierModel("grok-4.6"), true);
  assert.equal(isFrontierModel("grok-4.5"), true);
});

test("frontier model is rejected before the completer runs", async () => {
  let calls = 0;
  const result = await evaluatePointwise(
    { subject: "hello", rubricId: "default" },
    {
      model: "grok-4.6",
      complete: async () => {
        calls += 1;
        return "{}";
      },
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "config");
  assert.equal(calls, 0);
});
