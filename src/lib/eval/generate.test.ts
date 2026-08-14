import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGeneratePrompt,
  generateJudgedText,
} from "./generate";
import { generateHttp } from "./generateHttp";
import { accuracyFromScores, extractSseDelta, runningMean } from "./stream";

test("buildGeneratePrompt prefers context as the question", () => {
  const prompt = buildGeneratePrompt({
    context: "What is the capital of France?",
    subject: "This canned output should not be asked.",
  });
  assert.equal(prompt.user, "What is the capital of France?");
  assert.match(prompt.system, /factually/i);
});

test("generateJudgedText calls the injected completer with the question", async () => {
  let seenUser = "";
  let seenModel = "";
  const text = await generateJudgedText(
    { context: "What is the capital of Australia?", subject: "unused canned" },
    async ({ user, model }) => {
      seenUser = user;
      seenModel = model;
      return "Canberra is the capital of Australia.";
    },
    "grok-4.3",
  );
  assert.equal(seenUser, "What is the capital of Australia?");
  assert.equal(seenModel, "grok-4.3");
  assert.match(text, /Canberra/);
});

test("generateHttp with stub returns generated text without live xAI", async () => {
  const previous = process.env.EVAL_LLM_STUB;
  process.env.EVAL_LLM_STUB = "1";
  try {
    const response = await generateHttp(
      new Request("http://local/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "What is photosynthesis?",
          subject: "canned",
          model: "grok-4.20-0309-non-reasoning",
        }),
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; text?: string };
    assert.equal(body.ok, true);
    assert.match(body.text ?? "", /Stub generated answer/);
    assert.equal((body as { ttftMs?: number }).ttftMs, 2);
  } finally {
    if (previous === undefined) delete process.env.EVAL_LLM_STUB;
    else process.env.EVAL_LLM_STUB = previous;
  }
});

test("extractSseDelta reads first streamed token payload", () => {
  assert.equal(extractSseDelta("ignore"), null);
  assert.equal(extractSseDelta("data: [DONE]"), null);
  assert.equal(
    extractSseDelta('data: {"choices":[{"delta":{"content":"Paris"}}]}'),
    "Paris",
  );
});

test("accuracyFromScores prefers the accuracy criterion", () => {
  assert.equal(
    accuracyFromScores(
      [
        { id: "accuracy", score: 2 },
        { id: "clarity", score: 5 },
      ],
      4,
    ),
    2,
  );
  assert.equal(accuracyFromScores([], 3.5), 3.5);
  assert.equal(runningMean([2, 4, 6]), 4);
});
