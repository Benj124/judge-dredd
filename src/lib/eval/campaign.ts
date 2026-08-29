import { randomUUID } from "node:crypto";
import {
  saveCampaignMeta,
  saveEvaluateRun,
  type EvaluateRunInput,
  type StoredEvaluateRun,
} from "../db/store";
import { campaignTableRows, type CampaignTableRow } from "./campaignTable";
import { evaluatePointwise } from "./pipeline";
import { DEFAULT_JUDGE_MODEL } from "./models";
import { questionToEvaluateBody, type TestQuestion } from "./questions";
import type { EvaluateResult, JudgeComplete } from "./types";

export type CampaignPersist = (
  input: EvaluateRunInput,
) => Promise<StoredEvaluateRun>;

export type FixtureCampaignRun = {
  id: string;
  subject: string;
  result: EvaluateResult;
  storedId?: string;
};

export type CampaignRunOptions = {
  seed?: string;
  modelId?: string;
  datasetVersion?: string;
  persist?: CampaignPersist;
};

export type FixtureCampaign = {
  campaignId: string;
  seed: string;
  modelId: string;
  rubricVersion: string | null;
  datasetVersion: string;
  runs: FixtureCampaignRun[];
  table: CampaignTableRow[];
};

export async function runFixtureCampaign(
  questions: TestQuestion[],
  complete: JudgeComplete,
  persistOrOptions: CampaignPersist | CampaignRunOptions = saveEvaluateRun,
): Promise<FixtureCampaign> {
  const options: CampaignRunOptions =
    typeof persistOrOptions === "function"
      ? { persist: persistOrOptions }
      : persistOrOptions;
  const persist = options.persist ?? saveEvaluateRun;
  const campaignId = randomUUID();
  const seed = options.seed?.trim() || campaignId;
  const modelId = options.modelId?.trim() || DEFAULT_JUDGE_MODEL;
  const datasetVersion = options.datasetVersion?.trim() || "none";
  const runs: FixtureCampaignRun[] = [];
  let rubricVersion: string | null = null;

  for (const question of questions) {
    const result = await evaluatePointwise(questionToEvaluateBody(question), {
      complete,
      model: modelId,
    });
    const run: FixtureCampaignRun = {
      id: question.id,
      subject: question.subject,
      result,
    };
    if (result.ok) {
      rubricVersion = result.verdict.rubricVersion;
      const stored = await persist({
        subject: question.subject,
        context: question.context ?? null,
        reference: question.reference ?? null,
        campaignId,
        fixtureId: question.id,
        seed,
        modelId,
        datasetVersion,
        verdict: result.verdict,
      });
      run.storedId = stored.id;
    }
    runs.push(run);
  }

  await saveCampaignMeta({
    id: campaignId,
    seed,
    modelId,
    rubricVersion,
    datasetVersion,
  });

  return {
    campaignId,
    seed,
    modelId,
    rubricVersion,
    datasetVersion,
    runs,
    table: campaignTableRows(questions, runs),
  };
}
