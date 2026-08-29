import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { evaluatePointwise } from "./pipeline";
import { DEFAULT_RUBRIC } from "./rubrics";
import type { JudgeComplete } from "./types";

after(async () => {
  await closePool();
});

const stubJudge: JudgeComplete = async () =>
  JSON.stringify({
    scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
      id: criterion.id,
      score: 4,
      rationale: `ok ${criterion.id}`,
    })),
    rationale: "stub pointwise",
  });

test("evaluate result includes contains fact, JSON schema, citation IDs, and length next to the verdict", async () => {
  await migrate();
  const subject = JSON.stringify({
    answer: "Paris is the capital of France. [doc-1]",
    citations: ["doc-1"],
  });
  const result = await evaluatePointwise(
    {
      subject,
      context: "What is the capital of France?",
      reference: "Paris is the capital of France.",
      expectedFacts: ["Paris is the capital of France."],
      jsonSchema: { required: ["answer"] },
      citationIds: ["doc-1"],
      minChars: 10,
      maxChars: 500,
      rubricId: "default",
    },
    { complete: stubJudge },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(typeof result.verdict.overall, "number");
  assert.ok(result.checks);
  const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]));
  assert.equal(byId.contains_fact.passed, true);
  assert.equal(byId.json_schema.passed, true);
  assert.equal(byId.citation_ids.passed, true);
  assert.equal(byId.length.passed, true);
});

test("deterministic checks fail independently of a passing pointwise verdict", async () => {
  const result = await evaluatePointwise(
    {
      subject: "Nope.",
      expectedFacts: ["Paris is the capital of France."],
      jsonSchema: { required: ["answer"] },
      citationIds: ["doc-9"],
      minChars: 80,
      rubricId: "default",
    },
    { complete: stubJudge },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.verdict.passed, true);
  const byId = Object.fromEntries((result.checks ?? []).map((check) => [check.id, check]));
  assert.equal(byId.contains_fact.passed, false);
  assert.equal(byId.json_schema.passed, false);
  assert.equal(byId.citation_ids.passed, false);
  assert.equal(byId.length.passed, false);
});
