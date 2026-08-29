import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  persistSynthesisVersion,
  reviewDatasetItem,
} from "../db/datasetObject";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { getCampaignMeta, listCampaignEvaluateRuns } from "../db/store";
import { runFixtureCampaign } from "./campaign";
import { runGoldDatasetCampaign } from "./datasetCampaign";
import { DEFAULT_RUBRIC } from "./rubrics";
import { campaignFromGoldHttp } from "./synthDatasetHttp";
import type { JudgeComplete } from "./types";

after(async () => {
  await closePool();
});

test("campaign persists seed, model id, rubric version, dataset version and round-trips", async () => {
  await migrate();
  const complete: JudgeComplete = async () =>
    JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score: 4,
        rationale: "ok",
      })),
      rationale: "repeatable",
    });
  const campaign = await runFixtureCampaign(
    [
      {
        id: "repeat-1",
        subject: "Paris is the capital of France.",
        context: "What is the capital of France?",
        reference: "Paris",
      },
    ],
    complete,
    {
      seed: "seed-42",
      modelId: "grok-4.20-0309-non-reasoning",
      datasetVersion: "dataset-v3",
    },
  );
  assert.equal(campaign.seed, "seed-42");
  assert.equal(campaign.modelId, "grok-4.20-0309-non-reasoning");
  assert.equal(campaign.datasetVersion, "dataset-v3");
  assert.equal(campaign.rubricVersion, DEFAULT_RUBRIC.version);

  const meta = await getCampaignMeta(campaign.campaignId);
  assert.ok(meta);
  assert.equal(meta.seed, "seed-42");
  assert.equal(meta.modelId, "grok-4.20-0309-non-reasoning");
  assert.equal(meta.datasetVersion, "dataset-v3");
  assert.equal(meta.rubricVersion, DEFAULT_RUBRIC.version);

  const rows = await listCampaignEvaluateRuns(campaign.campaignId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].seed, "seed-42");
  assert.equal(rows[0].modelId, "grok-4.20-0309-non-reasoning");
  assert.equal(rows[0].datasetVersion, "dataset-v3");
  assert.equal(rows[0].rubricVersion, DEFAULT_RUBRIC.version);
});

test("runGoldDatasetCampaign and HTTP persist versionId and generate model", async () => {
  await migrate();
  const complete: JudgeComplete = async () =>
    JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score: 4,
        rationale: "ok",
      })),
      rationale: "gold campaign",
    });
  const stored = await persistSynthesisVersion({
    sourceSlug: `gold-camp-${Date.now()}`,
    prompt: "n/a",
    model: "test-synth",
    questions: [
      {
        question: "Where does zinnium form?",
        expected_facts: ["In granite caves."],
      },
    ],
  });
  const kept = await reviewDatasetItem({
    itemId: stored.items[0].id,
    action: "keep",
  });
  assert.equal(kept.isGold, true);
  const versionId = stored.version.id;
  const generateModel = "grok-4.3";

  try {
    const campaign = await runGoldDatasetCampaign({
      versionId,
      complete,
      generate: async ({ context }) => `Answer: ${context}`,
      seed: "gold-seed-7",
      modelId: generateModel,
    });
    assert.equal(campaign.datasetVersion, versionId);
    assert.equal(campaign.modelId, generateModel);
    assert.equal(campaign.seed, "gold-seed-7");
    assert.notEqual(campaign.datasetVersion, "none");

    const meta = await getCampaignMeta(campaign.campaignId);
    assert.ok(meta);
    assert.equal(meta.datasetVersion, versionId);
    assert.equal(meta.modelId, generateModel);
    assert.equal(meta.seed, "gold-seed-7");

    const rows = await listCampaignEvaluateRuns(campaign.campaignId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].datasetVersion, versionId);
    assert.equal(rows[0].modelId, generateModel);
    assert.equal(rows[0].seed, "gold-seed-7");

    const http = await campaignFromGoldHttp(
      new Request("http://localhost/api/datasets/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId,
          seed: "http-seed-9",
          model: generateModel,
        }),
      }),
      {
        complete,
        generate: async ({ context }) => `HTTP answer: ${context}`,
      },
    );
    assert.equal(http.status, 200);
    const body = (await http.json()) as {
      ok: boolean;
      campaignId: string;
      datasetVersion: string;
      modelId: string;
      seed: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.datasetVersion, versionId);
    assert.equal(body.modelId, generateModel);
    assert.equal(body.seed, "http-seed-9");
    assert.notEqual(body.datasetVersion, "none");

    const httpMeta = await getCampaignMeta(body.campaignId);
    assert.ok(httpMeta);
    assert.equal(httpMeta.datasetVersion, versionId);
    assert.equal(httpMeta.modelId, generateModel);
    assert.equal(httpMeta.seed, "http-seed-9");
  } finally {
    await getPool().query(`DELETE FROM datasets WHERE id = $1`, [
      stored.dataset.id,
    ]);
  }
});
