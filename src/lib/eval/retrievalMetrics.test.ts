import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePointwise } from "./pipeline";
import { recallAtK, scoreRetrievalGold } from "./retrievalMetrics";
import { DEFAULT_RUBRIC } from "./rubrics";
import type { JudgeComplete } from "./types";

const gold = [
  {
    doc_uri: "https://example.test/zinnium",
    content: "The zinnium crystal forms in granite caves.",
  },
];

const goodRank = [
  {
    id: "p1",
    text: "The zinnium crystal forms in granite caves.",
    source: "https://example.test/zinnium",
    score: 0.9,
  },
  { id: "p2", text: "Unrelated polar ice notes.", source: "other", score: 0.2 },
];

const badRank = [
  { id: "p2", text: "Unrelated polar ice notes.", source: "other", score: 0.9 },
  { id: "p3", text: "Shipping lanes and inventory.", source: "misc", score: 0.5 },
  {
    id: "p1",
    text: "The zinnium crystal forms in granite caves.",
    source: "https://example.test/zinnium",
    score: 0.1,
  },
];

test("recall@k and MRR drop when the gold passage is ranked worse", () => {
  const good = scoreRetrievalGold(gold, goodRank, 5);
  const bad = scoreRetrievalGold(gold, badRank, 5);
  assert.equal(good.recallAtK, 1);
  assert.equal(good.mrr, 1);
  assert.ok(bad.mrr < good.mrr, `expected worse MRR, good=${good.mrr} bad=${bad.mrr}`);
  assert.equal(recallAtK(gold, badRank.slice(0, 2), 2), 0);
  assert.equal(recallAtK(gold, badRank, 5), 1);
});

test("evaluate attaches retrieval metrics from injected retrieve vs expected_retrieved_context", async () => {
  const stubJudge: JudgeComplete = async () =>
    JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score: 4,
        rationale: "ok",
      })),
      rationale: "ok",
    });

  const goodEval = await evaluatePointwise(
    {
      subject: "Zinnium forms in granite caves.",
      context: "Where does zinnium form?",
      expected_retrieved_context: gold,
      rubricId: "default",
    },
    {
      complete: stubJudge,
      retrieve: async () =>
        goodRank.map((row) => ({
          id: row.id,
          text: row.text,
          score: row.score,
          source: row.source,
        })),
    },
  );
  const badEval = await evaluatePointwise(
    {
      subject: "Zinnium forms in granite caves.",
      context: "Where does zinnium form?",
      expected_retrieved_context: gold,
      rubricId: "default",
    },
    {
      complete: stubJudge,
      retrieve: async () =>
        badRank.map((row) => ({
          id: row.id,
          text: row.text,
          score: row.score,
          source: row.source,
        })),
    },
  );
  assert.equal(goodEval.ok, true);
  assert.equal(badEval.ok, true);
  if (!goodEval.ok || !badEval.ok) return;
  assert.equal(goodEval.retrieval?.recallAtK, 1);
  assert.equal(goodEval.retrieval?.mrr, 1);
  assert.ok(
    (badEval.retrieval?.mrr ?? 1) < (goodEval.retrieval?.mrr ?? 0),
    "wrong ranking must lower MRR",
  );
});
