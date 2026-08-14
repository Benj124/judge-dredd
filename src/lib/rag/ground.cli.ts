import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { evaluatePointwise } from "../eval/pipeline";
import { stubComplete } from "../eval/complete";
import { stubEmbed } from "./embed";
import { ingestSources } from "./ingest";
import { hybridRetrieve } from "./retrieve";

const PHRASE = "Zinnium crystal glows only at midnight";

async function main() {
  await migrate();
  const ingested = await ingestSources(
    [
      { text: `${PHRASE}. Treat this as source material.`, source: "cli-notes" },
      { text: "Water boils at 100 degrees Celsius at one atmosphere.", source: "cli-notes" },
    ],
    stubEmbed,
  );

  const result = await evaluatePointwise(
    {
      subject: "The briefing claims the zinnium crystal glows at midnight.",
      context: "Is this claim grounded in the source notes?",
      rubricId: "default",
    },
    {
      complete: stubComplete,
      retrieve: (query) => hybridRetrieve(query, { embed: stubEmbed }),
    },
  );

  process.stdout.write(
    JSON.stringify(
      {
        ingested: ingested.count,
        ok: result.ok,
        overall: result.ok ? result.verdict.overall : null,
        passages: result.ok ? result.verdict.retrievedPassages : [],
        error: result.ok ? null : result.error,
      },
      null,
      2,
    ) + "\n",
  );
  await closePool();
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
