import assert from "node:assert/strict";
import { test } from "node:test";
import { getJudgeComplete, stubComplete } from "./complete";
import { parseJudgeJson } from "./parse";
import { xaiComplete } from "./xai";

test("getJudgeComplete selects the stub when EVAL_LLM_STUB=1 and the live client otherwise", () => {
  const stubbed = getJudgeComplete({ EVAL_LLM_STUB: "1" } as unknown as NodeJS.ProcessEnv);
  const live = getJudgeComplete({} as unknown as NodeJS.ProcessEnv);
  assert.equal(stubbed, stubComplete);
  assert.equal(live, xaiComplete);
  assert.notEqual(stubbed, live);
});

test("stubComplete emits judge JSON for criterion ids in the user payload", async () => {
  const raw = await stubComplete({
    system: "judge",
    model: "unused",
    user: JSON.stringify({
      criteria: [{ id: "accuracy" }, { id: "clarity" }],
    }),
  });
  const parsed = parseJudgeJson(raw) as {
    scores: Array<{ id: string; score: number }>;
    rationale: string;
  };
  assert.deepEqual(
    parsed.scores.map((score) => score.id),
    ["accuracy", "clarity"],
  );
  assert.equal(typeof parsed.rationale, "string");
  assert.match(parsed.rationale, /Stub judge/);
});

test("xaiComplete fails closed on a missing key without opening a network request", async () => {
  const previous = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  try {
    await assert.rejects(
      () =>
        xaiComplete({
          system: "s",
          user: "u",
          model: "grok-4.20-0309-non-reasoning",
        }),
      /XAI_API_KEY is not set/,
    );
  } finally {
    if (previous === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previous;
  }
});
