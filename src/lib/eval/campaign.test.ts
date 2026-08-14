import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { listCampaignEvaluateRuns } from "../db/store";
import { runFixtureCampaign } from "./campaign";
import { campaignTableRows } from "./campaignTable";
import { loadQuestions } from "./questions";
import { DEFAULT_RUBRIC } from "./rubrics";
import type { JudgeComplete } from "./types";

after(async () => {
  await closePool();
});

const SCORE_BY_FIXTURE: Record<string, number> = {
  "capital-france": 5,
  "unfaithful-summary": 2,
  "incomplete-howto": 3,
  "clear-but-wrong": 2,
  "subject-only-list": 4,
};

function varyingJudge(questions: ReturnType<typeof loadQuestions>): JudgeComplete {
  return async ({ user }) => {
    const payload = JSON.parse(user) as { subject?: string };
    const match = questions.find((question) => question.subject === payload.subject);
    const score = match ? SCORE_BY_FIXTURE[match.id] : 3;
    return JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score,
        rationale: `${match?.id ?? "unknown"} ${criterion.id}`,
      })),
      rationale: `varied score ${score} for ${match?.id ?? "unknown"}`,
    });
  };
}

test("five fixtures load with non-empty subjects", () => {
  const questions = loadQuestions();
  assert.equal(questions.length, 5);
  for (const question of questions) {
    assert.ok(question.subject.trim());
  }
});

test("campaign evaluates, persists, and maps a table with varying scores", async () => {
  await migrate();
  const questions = loadQuestions();
  assert.equal(questions.length, 5);

  const campaign = await runFixtureCampaign(questions, varyingJudge(questions));
  assert.equal(campaign.runs.length, 5);

  const overalls = new Set<number>();
  for (const run of campaign.runs) {
    assert.equal(run.result.ok, true, run.id);
    if (!run.result.ok) continue;
    const { verdict } = run.result;
    assert.equal(typeof verdict.overall, "number");
    assert.ok(verdict.rationale.trim());
    assert.equal(verdict.overall, SCORE_BY_FIXTURE[run.id]);
    overalls.add(verdict.overall);
    for (const criterion of DEFAULT_RUBRIC.criteria) {
      const score = verdict.scores.find((entry) => entry.id === criterion.id);
      assert.ok(score);
      assert.ok(
        score.score >= criterion.scale.min && score.score <= criterion.scale.max,
      );
    }
  }
  assert.ok(overalls.size > 1, "fake judge must vary by fixture");

  const stored = await listCampaignEvaluateRuns(campaign.campaignId);
  assert.equal(stored.length, 5);
  for (const run of campaign.runs) {
    if (!run.result.ok) continue;
    const row = stored.find((entry) => entry.fixtureId === run.id);
    assert.ok(row, run.id);
    assert.equal(row.subject, run.subject);
    assert.equal(row.verdict.overall, run.result.verdict.overall);
    assert.equal(row.verdict.rationale, run.result.verdict.rationale);
  }

  const table = campaignTableRows(questions, campaign.runs);
  assert.equal(table.length, 5);
  for (const row of table) {
    assert.equal(row.overall, SCORE_BY_FIXTURE[row.fixtureId]);
    assert.equal(typeof row.passed, "boolean");
    assert.equal(row.error, null);
  }
});
