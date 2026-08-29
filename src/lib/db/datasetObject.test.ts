import assert from "node:assert/strict";
import { after, test } from "node:test";
import { stubComplete } from "../eval/complete";
import { campaignFromGoldHttp, reviewDatasetHttp } from "../eval/synthDatasetHttp";
import { runGoldDatasetCampaign } from "../eval/datasetCampaign";
import {
  exportGoldCsv,
  exportGoldJsonl,
  importGoldText,
  parseGoldCsv,
  parseGoldJsonl,
} from "../eval/datasetIo";
import { DEFAULT_RUBRIC } from "../eval/rubrics";
import type { JudgeComplete } from "../eval/types";
import { synthesizeAndPersist } from "../graph/synthesize";
import { synthesizeHttp } from "../graph/synthesizeHttp";
import { upsertTextDocument } from "../graph/store";
import { migrate } from "./migrate";
import { closePool, getPool } from "./pool";
import { listCampaignEvaluateRuns } from "./store";
import {
  getDatasetItem,
  hashPrompt,
  listGoldItems,
  listVersionItems,
  persistSynthesisVersion,
  reviewDatasetItem,
} from "./datasetObject";

after(async () => {
  await closePool();
});

function fixedJudge(score: number): JudgeComplete {
  return async () =>
    JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score,
        rationale: `stub ${criterion.id}`,
      })),
      rationale: `fixed ${score}`,
    });
}

async function seedDoc(slug: string, title: string, fullText: string) {
  await upsertTextDocument({
    slug,
    title,
    canonicalUrl: `https://en.wikipedia.org/wiki/Test_${slug}`,
    fullText,
  });
}

async function cleanupSlug(slug: string) {
  const pool = getPool();
  await pool.query(`DELETE FROM datasets WHERE slug = $1`, [`synth-${slug}`]);
  await pool.query(`DELETE FROM text_documents WHERE slug = $1`, [slug]);
}

test("migrate then persist+read stores pending items with provenance (not gold)", async () => {
  await migrate();
  const sourceSlug = `ds-migrate-${Date.now()}`;
  const prompt = "Make questions from {{full_text}}";
  const model = "test-synth-model";
  try {
    const stored = await persistSynthesisVersion({
      sourceSlug,
      prompt,
      model,
      questions: [
        {
          question: "When does the unit whale glow?",
          expected_facts: ["It glows blue at dusk."],
          difficulty: "easy",
        },
      ],
    });
    assert.ok(stored.version.id);
    assert.equal(stored.version.sourceSlug, sourceSlug);
    assert.equal(stored.version.promptHash, hashPrompt(prompt));
    assert.equal(stored.version.model, model);
    assert.ok(stored.version.createdAt);
    assert.equal(stored.items.length, 1);
    const item = stored.items[0];
    assert.equal(item.sourceSlug, sourceSlug);
    assert.equal(item.promptHash, hashPrompt(prompt));
    assert.equal(item.model, model);
    assert.ok(item.createdAt);
    assert.equal(item.isGold, false);
    assert.equal(item.reviewStatus, "pending");

    const loaded = await listVersionItems(stored.version.id);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, item.id);
    assert.equal(loaded[0].isGold, false);
    const gold = await listGoldItems(stored.version.id);
    assert.equal(gold.length, 0);
  } finally {
    await getPool().query(`DELETE FROM datasets WHERE slug = $1`, [
      `synth-${sourceSlug}`,
    ]);
  }
});

test("synthesizeAndPersist writes pending items; keep/edit/reject; export/import; campaign", async () => {
  await migrate();
  const slug = `ds-object-${Date.now()}`;
  const prompt = "Title {{title}} URL {{url}}\nText:\n{{full_text}}\nReturn JSON questions.";
  await seedDoc(
    slug,
    "Unit whale",
    "The unit whale is a fictional species used only in synthesize unit tests. It glows blue at dusk.",
  );

  try {
    const result = await synthesizeAndPersist({
      slug,
      promptTemplate: prompt,
      model: "test-synth-model",
      complete: async () =>
        JSON.stringify({
          questions: [
            {
              question: "When does the unit whale glow?",
              expected_facts: [
                "It glows blue at dusk.",
                "The unit whale is a fictional species.",
              ],
              difficulty: "easy",
            },
            {
              question: "Is the unit whale fictional?",
              expected_facts: ["It is a fictional species."],
              difficulty: "medium",
            },
            {
              question: "Where do unit whales live?",
              expected_facts: ["Not stated beyond tests."],
              difficulty: "hard",
            },
          ],
        }),
    });

    assert.ok(result.versionId);
    assert.equal(result.items.length, 3);
    for (const item of result.items) {
      assert.equal(item.source_slug, slug);
      assert.equal(item.prompt_hash, hashPrompt(prompt));
      assert.equal(item.model, "test-synth-model");
      assert.ok(item.created_at);
      assert.equal(item.is_gold, false);
      assert.equal(item.review_status, "pending");
    }

    const keepId = result.items[0].id;
    const editId = result.items[1].id;
    const rejectId = result.items[2].id;

    const kept = await reviewDatasetItem({ itemId: keepId, action: "keep" });
    assert.equal(kept.isGold, true);
    assert.equal(kept.reviewStatus, "kept");
    assert.equal(kept.question, "When does the unit whale glow?");
    assert.ok(
      kept.expectedFacts.length >= 2,
      "kept gold item must retain multiple expected facts for CSV newline round-trip",
    );

    const edited = await reviewDatasetItem({
      itemId: editId,
      action: "edit",
      question: "Is the unit whale only used in tests?",
      expectedFacts: ["Used only in synthesize unit tests."],
    });
    assert.equal(edited.isGold, true);
    assert.equal(edited.reviewStatus, "edited");
    assert.equal(edited.question, "Is the unit whale only used in tests?");
    assert.deepEqual(edited.expectedFacts, [
      "Used only in synthesize unit tests.",
    ]);

    const rejected = await reviewDatasetItem({
      itemId: rejectId,
      action: "reject",
    });
    assert.equal(rejected.isGold, false);
    assert.equal(rejected.reviewStatus, "rejected");

    const gold = await listGoldItems(result.versionId);
    assert.equal(gold.length, 2);
    assert.equal(
      gold.some((item) => item.id === rejectId),
      false,
    );
    const rejectedLoaded = await getDatasetItem(rejectId);
    assert.ok(rejectedLoaded);
    assert.equal(rejectedLoaded.isGold, false);

    const jsonl = exportGoldJsonl(gold);
    const csv = exportGoldCsv(gold);
    const parsedJsonl = parseGoldJsonl(jsonl);
    const parsedCsv = parseGoldCsv(csv);
    assert.equal(parsedJsonl.length, 2);
    assert.equal(
      parsedCsv.length,
      2,
      "CSV parser must not split quoted multi-fact reference newlines into extra rows",
    );

    const multiFactGold = gold.find((item) => item.expectedFacts.length >= 2);
    assert.ok(multiFactGold);
    const csvMulti = parsedCsv.find((row) => row.id === multiFactGold.id);
    const jsonlMulti = parsedJsonl.find((row) => row.id === multiFactGold.id);
    assert.ok(csvMulti);
    assert.ok(jsonlMulti);
    assert.deepEqual(csvMulti.expected_facts, multiFactGold.expectedFacts);
    assert.deepEqual(jsonlMulti.expected_facts, multiFactGold.expectedFacts);
    assert.equal(csvMulti.reference, multiFactGold.expectedFacts.join("\n"));
    assert.equal(csvMulti.source_slug, multiFactGold.sourceSlug);
    assert.equal(csvMulti.prompt_hash, multiFactGold.promptHash);
    assert.equal(csvMulti.model, multiFactGold.model);

    for (const row of [...parsedJsonl, ...parsedCsv]) {
      assert.ok(row.context.trim());
      assert.equal(row.context, row.question);
      assert.ok(row.reference.trim());
      assert.equal(row.reference, row.expected_facts.join("\n"));
      assert.ok(row.source_slug);
      assert.ok(row.prompt_hash);
      assert.ok(row.model);
      assert.ok(row.created_at);
    }

    const importedJsonl = await importGoldText({
      text: jsonl,
      format: "jsonl",
      datasetSlug: `import-jsonl-${slug}`,
    });
    assert.equal(importedJsonl.items.length, 2);
    for (const item of importedJsonl.items) {
      assert.equal(item.isGold, true);
      const mappedContext = item.question;
      const mappedReference = item.expectedFacts.join("\n");
      const original = parsedJsonl.find(
        (row) => row.context === mappedContext && row.reference === mappedReference,
      );
      assert.ok(original, "imported JSONL row should match exported context/reference");
      assert.equal(item.sourceSlug, original.source_slug);
      assert.equal(item.promptHash, original.prompt_hash);
      assert.equal(item.model, original.model);
    }

    const importedCsv = await importGoldText({
      text: csv,
      format: "csv",
      datasetSlug: `import-csv-${slug}`,
    });
    assert.equal(importedCsv.items.length, 2);
    const importedMulti = importedCsv.items.find(
      (item) => item.question === multiFactGold.question,
    );
    assert.ok(importedMulti);
    assert.deepEqual(importedMulti.expectedFacts, multiFactGold.expectedFacts);
    assert.equal(importedMulti.sourceSlug, multiFactGold.sourceSlug);
    assert.equal(importedMulti.promptHash, multiFactGold.promptHash);
    assert.equal(importedMulti.model, multiFactGold.model);
    for (const item of importedCsv.items) {
      assert.equal(item.question, item.question.trim());
      assert.ok(item.expectedFacts.length > 0);
      assert.ok(item.sourceSlug);
      assert.ok(item.promptHash);
      assert.ok(item.model);
    }

    const campaign = await runGoldDatasetCampaign({
      versionId: result.versionId,
      complete: fixedJudge(4),
      generate: async ({ context }) =>
        `Generated answer about: ${context ?? ""}`,
      seed: "object-gold-seed",
      modelId: "grok-4.3",
    });
    assert.equal(campaign.runs.length, 2);
    assert.equal(campaign.datasetVersion, result.versionId);
    assert.equal(campaign.modelId, "grok-4.3");
    assert.equal(campaign.seed, "object-gold-seed");
    const storedRuns = await listCampaignEvaluateRuns(campaign.campaignId);
    assert.equal(storedRuns.length, 2);
    assert.ok(storedRuns.every((row) => row.datasetVersion === result.versionId));
    assert.ok(storedRuns.every((row) => row.modelId === "grok-4.3"));
    const goldIds = new Set(gold.map((item) => item.id));
    for (const run of storedRuns) {
      assert.ok(run.fixtureId && goldIds.has(run.fixtureId), run.fixtureId ?? "");
      assert.match(run.subject, /Generated answer about:/);
      assert.ok(run.context);
      assert.ok(run.reference);
    }
    for (const item of gold) {
      const stored = storedRuns.find((row) => row.fixtureId === item.id);
      assert.ok(stored, item.id);
      assert.equal(stored.context, item.question);
      assert.equal(stored.reference, item.expectedFacts.join("\n"));
    }
  } finally {
    await cleanupSlug(slug);
    await getPool().query(
      `DELETE FROM datasets WHERE slug LIKE $1 OR slug LIKE $2`,
      [`import-jsonl-${slug}`, `import-csv-${slug}`],
    );
  }
});

test("synthesizeHttp persists pending items and review HTTP keep/reject", async () => {
  await migrate();
  const slug = `ds-http-${Date.now()}`;
  await seedDoc(slug, "HTTP whale", "HTTP whale articles exist only for API path tests.");
  try {
    const ok = await synthesizeHttp(
      new Request("http://localhost/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          prompt: "Make questions from {{title}}: {{full_text}}",
        }),
      }),
      {
        complete: async () =>
          JSON.stringify({
            questions: [
              {
                question: "What is an HTTP whale?",
                expected_facts: ["Used for API path tests."],
              },
              {
                question: "Should this be rejected?",
                expected_facts: ["No."],
              },
            ],
          }),
      },
    );
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as {
      ok: boolean;
      versionId: string;
      items: Array<{ id: string; is_gold: boolean; review_status: string }>;
    };
    assert.equal(body.ok, true);
    assert.ok(body.versionId);
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].is_gold, false);
    assert.equal(body.items[0].review_status, "pending");

    const keepRes = await reviewDatasetHttp(
      new Request("http://localhost/api/datasets/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: body.items[0].id, action: "keep" }),
      }),
    );
    assert.equal(keepRes.status, 200);
    const keepBody = (await keepRes.json()) as {
      ok: boolean;
      item: { is_gold: boolean; review_status: string };
    };
    assert.equal(keepBody.ok, true);
    assert.equal(keepBody.item.is_gold, true);
    assert.equal(keepBody.item.review_status, "kept");

    const campaignRes = await campaignFromGoldHttp(
      new Request("http://localhost/api/datasets/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: body.versionId }),
      }),
      {
        complete: stubComplete,
        generate: async ({ context }) => `Stub subject for ${context}`,
      },
    );
    assert.equal(campaignRes.status, 200);
    const campaignBody = (await campaignRes.json()) as {
      ok: boolean;
      campaignId: string;
      runs: Array<{ id: string }>;
    };
    assert.equal(campaignBody.ok, true);
    assert.equal(campaignBody.runs.length, 1);
    assert.equal(campaignBody.runs[0].id, body.items[0].id);
  } finally {
    await cleanupSlug(slug);
  }
});
