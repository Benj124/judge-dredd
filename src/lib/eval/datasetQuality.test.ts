import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimCheckFact,
  contaminationVsBenchmark,
  critiqueItem,
  interItemSimilarity,
} from "./datasetQuality";
import { loadPublicBenchmarkFixture } from "./loadBenchmark";

test("claim-check: fact in source/chunks passes; absent fact fails", () => {
  const source =
    "Paris is the capital of France. The Seine River flows through the city.";
  const chunks = [
    { text: "Paris is the capital of France.", source: "geo-001" },
  ];
  const present = claimCheckFact("Paris is the capital of France", {
    sourceText: source,
    chunks,
  });
  assert.equal(present.inSource, true);
  assert.equal(present.inChunks, true);
  assert.equal(present.passed, true);

  const absent = claimCheckFact("Berlin is the capital of Germany", {
    sourceText: source,
    chunks,
  });
  assert.equal(absent.inSource, false);
  assert.equal(absent.inChunks, false);
  assert.equal(absent.passed, false);
});

test("inter-item similarity flags near-paraphrase questions", () => {
  const similar = interItemSimilarity([
    "What is the capital of France?",
    "What is France's capital city?",
    "How do plants convert sunlight into energy?",
  ]);
  assert.equal(similar.flagged, true);
  assert.ok(similar.pairs.some((pair) => pair.i === 0 && pair.j === 1));
  const distinct = interItemSimilarity([
    "What is the capital of France?",
    "How do plants convert sunlight into energy?",
  ]);
  assert.equal(distinct.flagged, false);
});

test("contamination reports overlap with the local public-benchmark fixture", () => {
  const bench = loadPublicBenchmarkFixture();
  assert.ok(bench.length >= 3);
  assert.ok(bench.every((item) => item.id.startsWith("bench-")));
  const hit = contaminationVsBenchmark("What is the capital of France?", bench);
  assert.equal(hit.contaminated, true);
  assert.ok(hit.matches.some((match) => match.id === "bench-capital-france"));
  const clean = contaminationVsBenchmark(
    "How many moons does Jupiter have in this briefing?",
    bench,
  );
  assert.equal(clean.contaminated, false);
});

test("second-model critique accept vs reject does not mark gold", async () => {
  const accept = await critiqueItem(
    { question: "Where is Paris?", expected_facts: ["Paris is in France."] },
    async () => JSON.stringify({ decision: "accept", rationale: "grounded" }),
  );
  assert.equal(accept.decision, "accept");
  assert.equal(accept.marksGold, false);

  const reject = await critiqueItem(
    { question: "Invented?", expected_facts: ["nope"] },
    async () => JSON.stringify({ decision: "reject", rationale: "unsupported" }),
  );
  assert.equal(reject.decision, "reject");
  assert.equal(reject.marksGold, false);
});
