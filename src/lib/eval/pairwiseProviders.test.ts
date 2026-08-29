import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePointwise } from "./pipeline";
import { comparePairwise } from "./pairwise";
import { DEFAULT_JUDGE_MODEL, isFrontierModel, resolveJudgeModel } from "./models";
import { getSubjectComplete, openaiCompatibleComplete } from "./providers";
import { DEFAULT_RUBRIC } from "./rubrics";
import { XAI_BASE_URL } from "./xai";

test("pairwise A vs B preference does not replace pointwise 1–5", async () => {
  const pairwise = await comparePairwise({
    a: "Paris is the capital of France.",
    b: "Lyon is the capital of France.",
    context: "What is the capital of France?",
    complete: async () =>
      JSON.stringify({ preference: "A", rationale: "A is factually correct." }),
  });
  assert.equal(pairwise.preference, "A");
  assert.match(pairwise.rationale, /correct/i);
  assert.equal(isFrontierModel(pairwise.model), false);

  const pointwise = await evaluatePointwise(
    {
      subject: "Paris is the capital of France.",
      rubricId: "default",
    },
    {
      complete: async () =>
        JSON.stringify({
          scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
            id: criterion.id,
            score: 5,
            rationale: "accurate",
          })),
          rationale: "pointwise still works",
        }),
    },
  );
  assert.equal(pointwise.ok, true);
  if (!pointwise.ok) return;
  assert.equal(pointwise.verdict.scores.length, DEFAULT_RUBRIC.criteria.length);
  assert.ok(pointwise.verdict.overall >= 1 && pointwise.verdict.overall <= 5);
});

test("subject complete via OpenAI-compatible injected fetch and xAI shape; judge stays Grok-default", async () => {
  let openaiUrl = "";
  let openaiAuth = "";
  const openai = openaiCompatibleComplete({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    fetch: async (url, init) => {
      openaiUrl = url;
      openaiAuth = init.headers.Authorization;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "OpenAI subject answer." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  const openaiText = await openai({
    system: "Answer.",
    user: "Capital of France?",
    model: "gpt-test",
  });
  assert.equal(openaiText, "OpenAI subject answer.");
  assert.match(openaiUrl, /api\.openai\.com\/v1\/chat\/completions/);
  assert.match(openaiAuth, /^Bearer sk-test/);

  let xaiUrl = "";
  const xai = getSubjectComplete({
    provider: "xai",
    apiKey: "xai-test",
    fetch: async (url, init) => {
      xaiUrl = url;
      assert.match(init.headers.Authorization, /Bearer xai-test/);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "xAI subject answer." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  const xaiText = await xai({
    system: "Answer.",
    user: "Capital of France?",
    model: "grok-4.20-0309-non-reasoning",
  });
  assert.equal(xaiText, "xAI subject answer.");
  assert.equal(xaiUrl, `${XAI_BASE_URL}/chat/completions`);

  const judge = resolveJudgeModel();
  assert.equal(judge.ok, true);
  if (judge.ok) {
    assert.equal(judge.model, DEFAULT_JUDGE_MODEL);
    assert.equal(isFrontierModel(judge.model), false);
  }
  const frontier = resolveJudgeModel("grok-4.6");
  assert.equal(frontier.ok, false);
  if (!frontier.ok) {
    assert.match(frontier.error, /frontier/i);
  }
});
