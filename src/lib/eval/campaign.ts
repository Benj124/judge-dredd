import { randomUUID } from "node:crypto";
import {
  saveEvaluateRun,
  type EvaluateRunInput,
  type StoredEvaluateRun,
} from "../db/store";
import { campaignTableRows, type CampaignTableRow } from "./campaignTable";
import { evaluatePointwise } from "./pipeline";
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

export type FixtureCampaign = {
  campaignId: string;
  runs: FixtureCampaignRun[];
  table: CampaignTableRow[];
};

export async function runFixtureCampaign(
  questions: TestQuestion[],
  complete: JudgeComplete,
  persist: CampaignPersist = saveEvaluateRun,
): Promise<FixtureCampaign> {
  const campaignId = randomUUID();
  const runs: FixtureCampaignRun[] = [];

  for (const question of questions) {
    const result = await evaluatePointwise(questionToEvaluateBody(question), {
      complete,
    });
    const run: FixtureCampaignRun = {
      id: question.id,
      subject: question.subject,
      result,
    };
    if (result.ok) {
      const stored = await persist({
        subject: question.subject,
        context: question.context ?? null,
        reference: question.reference ?? null,
        campaignId,
        fixtureId: question.id,
        verdict: result.verdict,
      });
      run.storedId = stored.id;
    }
    runs.push(run);
  }

  return {
    campaignId,
    runs,
    table: campaignTableRows(questions, runs),
  };
}
