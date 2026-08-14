import { closePool } from "./pool";
import { migrate } from "./migrate";
import { getEvaluateRun, saveEvaluateRun } from "./store";

async function main() {
  await migrate();
  const subject = `smoke subject ${Date.now()}`;
  const saved = await saveEvaluateRun({
    subject,
    context: "smoke context",
    reference: "smoke reference",
    verdict: {
      rubricId: "default",
      rubricVersion: "1",
      scores: [
        { id: "accuracy", score: 4, rationale: "ok" },
        { id: "faithfulness", score: 4, rationale: "ok" },
        { id: "completeness", score: 3, rationale: "ok" },
        { id: "clarity", score: 5, rationale: "ok" },
      ],
      overall: 4,
      passed: true,
      rationale: "Smoke verdict rationale.",
    },
  });
  const loaded = await getEvaluateRun(saved.id);
  if (!loaded) {
    throw new Error("read-back returned no row");
  }
  process.stdout.write(
    JSON.stringify(
      {
        id: loaded.id,
        subject: loaded.subject,
        overall: loaded.verdict.overall,
        rationale: loaded.verdict.rationale,
      },
      null,
      2,
    ) + "\n",
  );
  await closePool();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
