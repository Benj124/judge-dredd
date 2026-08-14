import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closePool, getPool } from "./pool";

export function loadSchemaSql(): string {
  return readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
}

export async function migrate(): Promise<void> {
  const pool = getPool();
  await pool.query(loadSchemaSql());
}

async function main() {
  await migrate();
  process.stdout.write(
    "Migrated evaluate_runs, stored_rubrics, agentic_options, and rag_chunks schema.\n",
  );
  await closePool();
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("migrate.ts") || entry.endsWith("migrate.js")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
