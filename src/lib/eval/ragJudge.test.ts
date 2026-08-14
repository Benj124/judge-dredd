import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { stubEmbed } from "../rag/embed";
import { ingestSources } from "../rag/ingest";
import { hybridRetrieve } from "../rag/retrieve";
import { evaluatePointwise } from "./pipeline";
import { DEFAULT_RUBRIC } from "./rubrics";
import type { JudgeComplete } from "./types";

after(async () => {
  await closePool();
});

const PHRASE = "Zinnium crystal glows only at midnight";

function groundedJudge(): JudgeComplete {
  return async ({ user }) => {
    const payload = JSON.parse(user) as {
      retrievedPassages?: Array<{ text?: string }>;
    };
    const texts = (payload.retrievedPassages ?? [])
      .map((passage) => passage.text ?? "")
      .join(" ");
    const saw = texts.includes("Zinnium");
    const faithfulness = saw ? 5 : 1;
    return JSON.stringify({
      scores: DEFAULT_RUBRIC.criteria.map((criterion) => ({
        id: criterion.id,
        score: criterion.id === "faithfulness" ? faithfulness : 3,
        rationale:
          criterion.id === "faithfulness"
            ? saw
              ? "Grounded in retrieved Zinnium passage"
              : "No retrieved grounding"
            : "mid",
      })),
      rationale: saw
        ? `Judge saw retrieved phrase: ${PHRASE}`
        : "Judge did not see retrieved passages",
    });
  };
}

test("ingest then grounded evaluate uses retrieved passages before scoring", async () => {
  await migrate();
  const ingested = await ingestSources(
    [
      { text: `${PHRASE}. Treat this as source material.`, source: "lab-notes" },
      { text: "Penguins live in cold southern climates.", source: "decoy" },
    ],
    stubEmbed,
  );
  assert.ok(ingested.count >= 1);

  const result = await evaluatePointwise(
    {
      subject: "The briefing claims the zinnium crystal glows at midnight.",
      context: "Is this claim grounded in the source notes?",
      rubricId: "default",
    },
    {
      complete: groundedJudge(),
      retrieve: (query) => hybridRetrieve(query, { embed: stubEmbed }),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const passages = result.verdict.retrievedPassages ?? [];
  assert.ok(passages.length > 0, "expected hybrid retrieve to return passages");
  assert.ok(
    passages.some((passage) => passage.text.includes("Zinnium")),
    "expected ingested Zinnium phrase in retrieved passages",
  );

  const faithfulness = result.verdict.scores.find(
    (score) => score.id === "faithfulness",
  );
  assert.ok(faithfulness);
  const criterion = DEFAULT_RUBRIC.criteria.find((item) => item.id === "faithfulness");
  assert.ok(criterion);
  assert.ok(
    faithfulness.score >= criterion.scale.min &&
      faithfulness.score <= criterion.scale.max,
  );
  assert.equal(faithfulness.score, 5);
  assert.match(result.verdict.rationale, /Zinnium/);
});
