import { randomUUID } from "node:crypto";
import {
  saveEvaluateRun,
  type EvaluateRunInput,
  type StoredEvaluateRun,
} from "../db/store";
import type { BatchJob } from "./batchParse";
import { evaluatePointwise } from "./pipeline";
import type { EvaluateResult, JudgeComplete } from "./types";

export type BatchPersist = (
  input: EvaluateRunInput,
) => Promise<StoredEvaluateRun>;

export type BatchRun = {
  id: string;
  subject: string;
  result: EvaluateResult;
  storedId?: string;
};

export type BatchCampaign = {
  campaignId: string;
  runs: BatchRun[];
};

export async function runBatchEvaluate(
  jobs: BatchJob[],
  complete: JudgeComplete,
  persist: BatchPersist = saveEvaluateRun,
): Promise<BatchCampaign> {
  const campaignId = randomUUID();
  const runs: BatchRun[] = [];
  for (const job of jobs) {
    const result = await evaluatePointwise(
      {
        subject: job.subject,
        context: job.context,
        reference: job.reference,
        rubricId: "default",
        fixtureId: job.id,
      },
      { complete },
    );
    const run: BatchRun = { id: job.id, subject: job.subject, result };
    if (result.ok) {
      const stored = await persist({
        subject: job.subject,
        context: job.context ?? null,
        reference: job.reference ?? null,
        campaignId,
        fixtureId: job.id,
        verdict: result.verdict,
      });
      run.storedId = stored.id;
    }
    runs.push(run);
  }
  return { campaignId, runs };
}
