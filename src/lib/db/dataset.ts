import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import { parseCsvJobs, type BatchJob } from "../eval/batchParse";
import { getPool } from "./pool";

export type DatasetRow = BatchJob & { sourceFile: string };

export function loadEvalCsv(filename = "eval_data.csv"): BatchJob[] {
  const text = readFileSync(join(process.cwd(), filename), "utf8");
  return parseCsvJobs(text);
}

export async function upsertDatasetRows(
  jobs: BatchJob[],
  sourceFile: string,
  pool: Pool = getPool(),
): Promise<number> {
  let count = 0;
  for (const job of jobs) {
    await pool.query(
      `INSERT INTO eval_dataset_rows (id, subject, context, reference, source_file)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         subject = EXCLUDED.subject,
         context = EXCLUDED.context,
         reference = EXCLUDED.reference,
         source_file = EXCLUDED.source_file`,
      [
        job.id,
        job.subject,
        job.context ?? null,
        job.reference ?? null,
        sourceFile,
      ],
    );
    count += 1;
  }
  return count;
}

export async function listDatasetRows(
  sourceFile?: string,
  pool: Pool = getPool(),
): Promise<DatasetRow[]> {
  const result = sourceFile
    ? await pool.query<{
        id: string;
        subject: string;
        context: string | null;
        reference: string | null;
        source_file: string;
      }>(
        `SELECT id, subject, context, reference, source_file
         FROM eval_dataset_rows
         WHERE source_file = $1
         ORDER BY id`,
        [sourceFile],
      )
    : await pool.query<{
        id: string;
        subject: string;
        context: string | null;
        reference: string | null;
        source_file: string;
      }>(
        `SELECT id, subject, context, reference, source_file
         FROM eval_dataset_rows
         ORDER BY id`,
      );
  return result.rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    context: row.context ?? undefined,
    reference: row.reference ?? undefined,
    sourceFile: row.source_file,
  }));
}
