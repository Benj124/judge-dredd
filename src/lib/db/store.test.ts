import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DEFAULT_JUDGE_MODEL } from "../eval/models";
import type { Rubric } from "../eval/types";
import { migrate } from "./migrate";
import { closePool } from "./pool";
import {
  deleteStoredRubric,
  getAgenticOptions,
  getEvaluateRun,
  getStoredRubric,
  isStoredRubricTestPollutionId,
  listStoredRubrics,
  purgeStoredRubricTestPollution,
  saveAgenticOptions,
  saveEvaluateRun,
  saveStoredRubric,
} from "./store";

after(async () => {
  await closePool();
});

function sampleRubric(id: string): Rubric {
  return {
    id,
    version: "1",
    name: `Test rubric ${id}`,
    description: "Persisted via store tests",
    overallPassRule: "weighted_average",
    overallPassThreshold: 3,
    criteria: [
      {
        id: "accuracy",
        name: "Accuracy",
        description: "Correctness",
        scale: { min: 1, max: 5 },
        weight: 1,
        passThreshold: 3,
      },
      {
        id: "clarity",
        name: "Clarity",
        description: "Readable",
        scale: { min: 1, max: 5 },
        weight: 1,
      },
    ],
  };
}

test("saveEvaluateRun then getEvaluateRun round-trips subject and verdict", async () => {
  await migrate();
  const subject = `round-trip ${Date.now()}`;
  const rationale = "Persisted without calling a model.";
  const overall = 3.5;
  const saved = await saveEvaluateRun({
    subject,
    context: "What happened?",
    reference: "A short answer.",
    verdict: {
      rubricId: "default",
      rubricVersion: "1",
      scores: [
        { id: "accuracy", score: 3, rationale: "close" },
        { id: "faithfulness", score: 4, rationale: "grounded" },
      ],
      overall,
      passed: true,
      rationale,
    },
  });

  const loaded = await getEvaluateRun(saved.id);
  assert.ok(loaded);
  assert.equal(loaded.id, saved.id);
  assert.equal(loaded.subject, subject);
  assert.equal(loaded.context, "What happened?");
  assert.equal(loaded.reference, "A short answer.");
  assert.equal(loaded.verdict.overall, overall);
  assert.equal(loaded.verdict.rationale, rationale);
  assert.equal(loaded.verdict.passed, true);
  assert.equal(loaded.verdict.scores[0].id, "accuracy");
  assert.equal(loaded.verdict.scores[0].score, 3);
});

test("getEvaluateRun returns null for an unknown id", async () => {
  await migrate();
  const missing = await getEvaluateRun("00000000-0000-4000-8000-000000000000");
  assert.equal(missing, null);
});

test("saveStoredRubric then get/list/update round-trips fields", async () => {
  await migrate();
  const id = `store-rubric-${Date.now()}`;
  try {
    const created = await saveStoredRubric(sampleRubric(id));
    assert.equal(created.id, id);
    assert.equal(created.name, `Test rubric ${id}`);
    assert.equal(created.criteria.length, 2);

    const loaded = await getStoredRubric(id);
    assert.ok(loaded);
    assert.equal(loaded.version, "1");
    assert.equal(loaded.overallPassRule, "weighted_average");
    assert.equal(loaded.criteria[0].id, "accuracy");

    const listed = await listStoredRubrics();
    assert.equal(listed.filter((rubric) => rubric.id === id).length, 1);

    const updated = await saveStoredRubric({
      ...sampleRubric(id),
      version: "2",
      name: "Updated store rubric",
      overallPassThreshold: 4,
    });
    assert.equal(updated.version, "2");
    assert.equal(updated.name, "Updated store rubric");
    assert.equal(updated.overallPassThreshold, 4);

    const reloaded = await getStoredRubric(id);
    assert.ok(reloaded);
    assert.equal(reloaded.version, "2");
    assert.equal(reloaded.name, "Updated store rubric");
    assert.equal(
      (await listStoredRubrics()).filter((rubric) => rubric.id === id).length,
      1,
    );
  } finally {
    await deleteStoredRubric(id);
  }
  assert.equal(await getStoredRubric(id), null);
});

test("purgeStoredRubricTestPollution removes known test id prefixes only", async () => {
  await migrate();
  const junkA = `http-rubric-${Date.now()}-a`;
  const junkB = `store-then-eval-${Date.now()}-b`;
  const keepId = `user-prompt-${Date.now()}`;
  try {
    await saveStoredRubric(sampleRubric(junkA));
    await saveStoredRubric(sampleRubric(junkB));
    await saveStoredRubric({
      ...sampleRubric(keepId),
      name: "Keep me",
    });

    assert.equal(isStoredRubricTestPollutionId(junkA), true);
    assert.equal(isStoredRubricTestPollutionId(keepId), false);

    const deleted = await purgeStoredRubricTestPollution();
    assert.ok(deleted.includes(junkA));
    assert.ok(deleted.includes(junkB));
    assert.ok(!deleted.includes(keepId));

    assert.equal(await getStoredRubric(junkA), null);
    assert.equal(await getStoredRubric(junkB), null);
    const kept = await getStoredRubric(keepId);
    assert.ok(kept);
    assert.equal(kept.name, "Keep me");

    const remainingJunk = (await listStoredRubrics()).filter((rubric) =>
      isStoredRubricTestPollutionId(rubric.id),
    );
    assert.equal(remainingJunk.length, 0);
  } finally {
    await deleteStoredRubric(keepId).catch(() => undefined);
    await deleteStoredRubric(junkA).catch(() => undefined);
    await deleteStoredRubric(junkB).catch(() => undefined);
  }
});

test("saveAgenticOptions then getAgenticOptions round-trips judgeModel", async () => {
  await migrate();
  const model = `test-judge-model-${Date.now()}`;
  const saved = await saveAgenticOptions({ judgeModel: model });
  assert.equal(saved.judgeModel, model);
  assert.ok(saved.updatedAt);

  const loaded = await getAgenticOptions();
  assert.equal(loaded.judgeModel, model);

  const restored = await saveAgenticOptions({
    judgeModel: DEFAULT_JUDGE_MODEL,
  });
  assert.equal(restored.judgeModel, DEFAULT_JUDGE_MODEL);
});
