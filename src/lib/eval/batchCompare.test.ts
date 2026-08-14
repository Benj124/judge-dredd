import assert from "node:assert/strict";
import { after, test } from "node:test";
import { listCampaignEvaluateRuns, saveEvaluateRun } from "../db/store";
import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { runBatchEvaluate } from "./batch";
import { parseCsvJobs, parseJsonlJobs } from "./batchParse";
import { compareEvaluateRuns } from "./compare";
import { DEFAULT_RUBRIC } from "./rubrics";
import type { JudgeComplete } from "./types";

after(async () => {
  await closePool();
});

const JSONL = [
  '{"id":"j1","subject":"Alpha subject one","context":"ctx-a"}',
  '{"id":"j2","subject":"Beta subject two","reference":"ref-b"}',
].join("\n");

const CSV = [
  "id,subject,context,reference",
  "c1,Charlie subject,ctx-c,",
  'c2,"Delta, quoted subject",,ref-d',
].join("\n");

function varyingJudge(): JudgeComplete {
  return async ({ user }) => {
    const payload = JSON.parse(user) as { subject?: string };
    const score = (payload.subject?.includes("Alpha") || payload.subject?.includes("Charlie"))
      ? 5
      : 2;
    return JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score,
        rationale: `${criterion.id} ${score}`,
      })),
      rationale: `varied ${score} for ${payload.subject}`,
    });
  };
}

test("JSONL and CSV parsers yield multiple jobs with subjects", () => {
  const jsonl = parseJsonlJobs(JSONL);
  assert.equal(jsonl.length, 2);
  assert.equal(jsonl[0].id, "j1");
  assert.equal(jsonl[0].subject, "Alpha subject one");
  assert.equal(jsonl[0].context, "ctx-a");
  assert.equal(jsonl[1].reference, "ref-b");

  const csv = parseCsvJobs(CSV);
  assert.equal(csv.length, 2);
  assert.equal(csv[0].id, "c1");
  assert.equal(csv[1].subject, "Delta, quoted subject");
  assert.equal(csv[1].reference, "ref-d");
});

test("batch evaluate persists a retrieveable set; compare reports shipped deltas", async () => {
  await migrate();
  const jobs = parseJsonlJobs(JSONL);
  const batch = await runBatchEvaluate(jobs, varyingJudge());
  assert.equal(batch.runs.length, 2);
  const overalls = new Set<number>();
  for (const run of batch.runs) {
    assert.equal(run.result.ok, true, run.id);
    if (!run.result.ok) continue;
    overalls.add(run.result.verdict.overall);
    assert.ok(Number.isFinite(run.result.verdict.overall));
  }
  assert.ok(overalls.size > 1);

  const stored = await listCampaignEvaluateRuns(batch.campaignId);
  assert.equal(stored.length, 2);
  for (const run of batch.runs) {
    if (!run.result.ok) continue;
    const row = stored.find((entry) => entry.fixtureId === run.id);
    assert.ok(row, run.id);
    assert.equal(row.subject, run.subject);
    assert.equal(row.verdict.overall, run.result.verdict.overall);
  }

  const a = await saveEvaluateRun({
    subject: "compare-a",
    verdict: {
      rubricId: "default",
      rubricVersion: "1",
      scores: [
        { id: "accuracy", score: 4 },
        { id: "clarity", score: 3 },
      ],
      overall: 4,
      passed: true,
      rationale: "A side",
    },
  });
  const b = await saveEvaluateRun({
    subject: "compare-b",
    verdict: {
      rubricId: "default",
      rubricVersion: "2",
      scores: [
        { id: "accuracy", score: 2 },
        { id: "clarity", score: 5 },
      ],
      overall: 2,
      passed: false,
      rationale: "B side",
    },
  });

  const compared = compareEvaluateRuns(a, b);
  assert.equal(compared.a.overall, a.verdict.overall);
  assert.equal(compared.b.overall, b.verdict.overall);
  assert.equal(compared.overallDelta, b.verdict.overall - a.verdict.overall);
  assert.equal(compared.rubricVersions.a, "1");
  assert.equal(compared.rubricVersions.b, "2");
  const accuracy = compared.criterionDeltas.find((item) => item.id === "accuracy");
  const clarity = compared.criterionDeltas.find((item) => item.id === "clarity");
  assert.equal(accuracy?.delta, 2 - 4);
  assert.equal(clarity?.delta, 5 - 3);
});
