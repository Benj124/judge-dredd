import { ingestSources } from "../rag/ingest";
import type { EmbedFn } from "../rag/embed";
import {
  loadEvalCsv,
  upsertDatasetRows,
  type DatasetRow,
} from "../db/dataset";
import type { BatchJob } from "./batchParse";

export async function etlEvalCsv(options: {
  filename?: string;
  embed: EmbedFn;
}): Promise<{ jobs: BatchJob[]; rowsUpserted: number; ragIngested: number }> {
  const filename = options.filename ?? "eval_data.csv";
  const jobs = loadEvalCsv(filename);
  const rowsUpserted = await upsertDatasetRows(jobs, filename);
  const sources = jobs.flatMap((job) => {
    const items: Array<{ text: string; source: string }> = [];
    if (job.reference) {
      items.push({
        text: job.reference,
        source: `${filename}:${job.id}:reference`,
      });
    }
    if (job.context) {
      items.push({
        text: job.context,
        source: `${filename}:${job.id}:context`,
      });
    }
    return items;
  });
  const rag = await ingestSources(sources, options.embed);
  return { jobs, rowsUpserted, ragIngested: rag.count };
}

export function jobsFromDatasetRows(rows: DatasetRow[]): BatchJob[] {
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    context: row.context,
    reference: row.reference,
  }));
}
