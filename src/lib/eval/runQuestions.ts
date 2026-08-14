import { evaluatePointwise } from "./pipeline";
import { questionToEvaluateBody, type TestQuestion } from "./questions";
import type { EvaluateResult, JudgeComplete } from "./types";

export type QuestionRun = {
  id: string;
  subject: string;
  result: EvaluateResult;
};

export async function runQuestions(
  questions: TestQuestion[],
  complete: JudgeComplete,
): Promise<QuestionRun[]> {
  const runs: QuestionRun[] = [];
  for (const question of questions) {
    const result = await evaluatePointwise(
      questionToEvaluateBody(question),
      { complete },
    );
    runs.push({
      id: question.id,
      subject: question.subject,
      result,
    });
  }
  return runs;
}

export function formatQuestionReport(runs: QuestionRun[]): string {
  return runs
    .map((run) => {
      const header = `=== ${run.id} ===`;
      if (!run.result.ok) {
        return [
          header,
          `ok: false`,
          `error: ${run.result.error}`,
          `code: ${run.result.code}`,
        ].join("\n");
      }
      const { verdict } = run.result;
      const scores = verdict.scores
        .map((score) => `${score.id}=${score.score}`)
        .join(", ");
      return [
        header,
        `ok: true`,
        `overall: ${verdict.overall}`,
        `passed: ${verdict.passed === null ? "n/a" : verdict.passed}`,
        `scores: ${scores}`,
        `rationale: ${verdict.rationale}`,
      ].join("\n");
    })
    .join("\n\n");
}
