import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { evaluateHttp, listRubricsHttp } from "./http";
import {
  DEFAULT_RUBRIC,
  DEFAULT_RUBRIC_ID,
  getRubric,
  listAllRubrics,
  listRubrics,
  resolveRubric,
} from "./rubrics";

const originalStub = process.env.EVAL_LLM_STUB;
const originalKey = process.env.XAI_API_KEY;

afterEach(() => {
  if (originalStub === undefined) delete process.env.EVAL_LLM_STUB;
  else process.env.EVAL_LLM_STUB = originalStub;
  if (originalKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalKey;
});

test("built-in evaluation prompt catalog has at least three usable prompts", () => {
  const catalog = listRubrics();
  assert.ok(catalog.length >= 3, `expected ≥3 built-ins, got ${catalog.length}`);

  const ids = catalog.map((prompt) => prompt.id);
  assert.equal(new Set(ids).size, ids.length, "built-in ids must be unique");

  for (const prompt of catalog) {
    assert.ok(prompt.id.trim().length > 0, "id required");
    assert.ok(prompt.name.trim().length > 0, `name required for ${prompt.id}`);
    assert.ok(
      typeof prompt.description === "string" && prompt.description.trim().length > 0,
      `description required for ${prompt.id}`,
    );
    assert.ok(prompt.criteria.length >= 1, `criteria required for ${prompt.id}`);
    for (const criterion of prompt.criteria) {
      assert.ok(criterion.id.trim().length > 0);
      assert.ok(criterion.name.trim().length > 0);
      assert.ok(Number.isFinite(criterion.scale.min));
      assert.ok(Number.isFinite(criterion.scale.max));
      assert.ok(criterion.scale.max >= criterion.scale.min);
    }
    assert.equal(getRubric(prompt.id), prompt);
  }

  assert.ok(ids.includes(DEFAULT_RUBRIC_ID));
  assert.equal(getRubric(DEFAULT_RUBRIC_ID), DEFAULT_RUBRIC);
});

test("listAllRubrics includes every built-in without DB seed", async () => {
  const builtIn = listRubrics();
  const all = await listAllRubrics();
  for (const prompt of builtIn) {
    const matches = all.filter((entry) => entry.id === prompt.id);
    assert.equal(
      matches.length,
      1,
      `built-in ${prompt.id} should appear exactly once in listAllRubrics`,
    );
    assert.equal(matches[0].name, prompt.name);
  }
});

test("listRubricsHttp exposes every built-in evaluation prompt", async () => {
  const response = await listRubricsHttp();
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok: boolean;
    rubrics: Array<{ id: string; name: string; criteria: Array<{ id: string }> }>;
  };
  assert.equal(payload.ok, true);

  for (const prompt of listRubrics()) {
    const listed = payload.rubrics.filter((entry) => entry.id === prompt.id);
    assert.equal(listed.length, 1, `HTTP list missing or duplicating ${prompt.id}`);
    assert.equal(listed[0].name, prompt.name);
    assert.deepEqual(
      listed[0].criteria.map((criterion) => criterion.id),
      prompt.criteria.map((criterion) => criterion.id),
    );
  }
});

test("resolveRubric returns each built-in offline", async () => {
  for (const prompt of listRubrics()) {
    const resolved = await resolveRubric(prompt.id);
    assert.ok(resolved);
    assert.equal(resolved.id, prompt.id);
    assert.equal(resolved.name, prompt.name);
  }
});

test("stub evaluate succeeds for every built-in evaluation prompt id", async () => {
  process.env.EVAL_LLM_STUB = "1";
  delete process.env.XAI_API_KEY;

  for (const prompt of listRubrics()) {
    const response = await evaluateHttp(
      new Request("http://local/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "A short subject for the stub judge to score.",
          context: "Optional context for grounded or instruction prompts.",
          rubricId: prompt.id,
        }),
      }),
    );
    assert.equal(response.status, 200, `evaluate failed for ${prompt.id}`);
    const payload = (await response.json()) as {
      ok: boolean;
      verdict?: {
        rubricId: string;
        scores: Array<{ id: string; score: number }>;
      };
    };
    assert.equal(payload.ok, true, `ok false for ${prompt.id}`);
    assert.ok(payload.verdict);
    assert.equal(payload.verdict.rubricId, prompt.id);
    const scoreIds = payload.verdict.scores.map((score) => score.id).sort();
    const criterionIds = prompt.criteria.map((criterion) => criterion.id).sort();
    assert.deepEqual(
      scoreIds,
      criterionIds,
      `score coverage mismatch for ${prompt.id}`,
    );
  }
});
