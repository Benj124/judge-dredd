import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closePool, getPool } from "./pool";

export function loadSchemaSql(): string {
  return readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
}

function isRetryableMigrateError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code: unknown }).code);
  return code === "40P01" || code === "55P03";
}

export async function migrate(): Promise<void> {
  const pool = getPool();
  const sql = loadSchemaSql();
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await pool.query(sql);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableMigrateError(error) || attempt === 5) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function main() {
  await migrate();
  process.stdout.write(
    "Migrated evaluate_runs, campaigns, stored_rubrics, agentic_options, rag_chunks, eval_dataset_rows, text_documents, datasets, dataset_versions, dataset_items, and synthesis_templates schema.\n",
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
