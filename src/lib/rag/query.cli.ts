import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { stubEmbed } from "./embed";
import { runRetrieveGraph } from "./graph";
import { insertChunks } from "./retrieve";

const SAMPLE = [
  { source: "setup", content: "The capital of France is Paris." },
  { source: "setup", content: "Water boils at 100 degrees Celsius at one atmosphere." },
  { source: "setup", content: "Primary colors are red, blue, and yellow." },
];

async function ensureSampleChunks() {
  const pool = getPool();
  const count = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM rag_chunks");
  if (Number(count.rows[0]?.n ?? 0) > 0) return;
  await insertChunks(SAMPLE, stubEmbed, pool);
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim() || "What is the capital of France?";
  await migrate();
  await ensureSampleChunks();
  const passages = await runRetrieveGraph(query, stubEmbed);
  process.stdout.write(
    JSON.stringify({ query, count: passages.length, passages }, null, 2) + "\n",
  );
  await closePool();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
