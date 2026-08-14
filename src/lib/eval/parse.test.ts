import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractJudgeOutput,
  parseJudgeJson,
  scoresById,
} from "./parse";
import { DEFAULT_RUBRIC } from "./rubrics";

const judgeObject = {
  scores: [
    { id: "accuracy", score: 4, rationale: "right" },
    { id: "faithfulness", score: 3 },
  ],
  rationale: "  Mixed.  ",
};

test("parseJudgeJson reads raw and fenced JSON", () => {
  assert.deepEqual(parseJudgeJson(JSON.stringify({ ok: true })), { ok: true });
  const fenced = parseJudgeJson(
    "Here you go:\n```json\n" + JSON.stringify(judgeObject) + "\n```\n",
  );
  assert.deepEqual(fenced, judgeObject);
});

test("parseJudgeJson rejects empty or non-JSON text", () => {
  assert.throws(() => parseJudgeJson("   "), /empty response/);
  assert.throws(() => parseJudgeJson("not-json"), SyntaxError);
});

test("extractJudgeOutput requires rationale and a scores array of numeric ids", () => {
  const extracted = extractJudgeOutput(judgeObject);
  assert.equal(extracted.rationale, "Mixed.");
  assert.equal(extracted.scores.length, 2);
  assert.equal(extracted.scores[0].rationale, "right");
  assert.equal(extracted.scores[1].rationale, undefined);

  assert.throws(() => extractJudgeOutput(null), /JSON object/);
  assert.throws(() => extractJudgeOutput({ scores: [] }), /rationale/);
  assert.throws(
    () => extractJudgeOutput({ rationale: "x" }),
    /scores array/,
  );
  assert.throws(
    () =>
      extractJudgeOutput({
        rationale: "x",
        scores: [{ id: "accuracy", score: "high" }],
      }),
    /finite number/,
  );
  assert.throws(
    () => extractJudgeOutput({ rationale: "x", scores: [{ score: 1 }] }),
    /missing an id/,
  );
});

test("scoresById maps in-scale scores and rejects missing or out-of-range ones", () => {
  const complete = DEFAULT_RUBRIC.criteria.map((criterion) => ({
    id: criterion.id,
    score: criterion.scale.min,
  }));
  const mapped = scoresById(complete, DEFAULT_RUBRIC);
  for (const criterion of DEFAULT_RUBRIC.criteria) {
    assert.equal(mapped[criterion.id], criterion.scale.min);
  }

  assert.throws(
    () => scoresById(complete.slice(0, 1), DEFAULT_RUBRIC),
    /Missing score/,
  );
  assert.throws(
    () =>
      scoresById(
        complete.map((score) =>
          score.id === "accuracy"
            ? { ...score, score: DEFAULT_RUBRIC.criteria[0].scale.max + 1 }
            : score,
        ),
        DEFAULT_RUBRIC,
      ),
    /outside/,
  );
});
