import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { stubEmbed } from "../rag/embed";
import { etlEvalCsv } from "./etlDataset";

async function main() {
  await migrate();
  const result = await etlEvalCsv({ embed: stubEmbed });
  process.stdout.write(
    JSON.stringify(
      {
        filename: "eval_data.csv",
        jobs: result.jobs.length,
        rowsUpserted: result.rowsUpserted,
        ragIngested: result.ragIngested,
        ids: result.jobs.map((job) => job.id),
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
