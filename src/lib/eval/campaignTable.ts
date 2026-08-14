import type { EvaluateResult } from "./types";
import type { TestQuestion } from "./questions";

export type CampaignTableRow = {
  fixtureId: string;
  title: string;
  overall: number | null;
  passed: boolean | null;
  error: string | null;
};

export type CampaignRunLike = {
  id: string;
  result: EvaluateResult;
};

export function campaignTableRows(
  questions: TestQuestion[],
  runs: CampaignRunLike[],
): CampaignTableRow[] {
  const byId = new Map(runs.map((run) => [run.id, run.result]));
  return questions.map((question) => {
    const result = byId.get(question.id);
    if (!result) {
      return {
        fixtureId: question.id,
        title: question.title ?? question.id,
        overall: null,
        passed: null,
        error: null,
      };
    }
    if (!result.ok) {
      return {
        fixtureId: question.id,
        title: question.title ?? question.id,
        overall: null,
        passed: null,
        error: result.error,
      };
    }
    return {
      fixtureId: question.id,
      title: question.title ?? question.id,
      overall: result.verdict.overall,
      passed: result.verdict.passed,
      error: null,
    };
  });
}
