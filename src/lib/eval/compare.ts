import type { StoredEvaluateRun } from "../db/store";

export type CriterionDelta = {
  id: string;
  a: number | null;
  b: number | null;
  delta: number | null;
};

export type CompareResult = {
  a: {
    id: string;
    overall: number;
    passed: boolean | null;
    rubricId: string;
    rubricVersion: string;
    scores: Array<{ id: string; score: number }>;
  };
  b: {
    id: string;
    overall: number;
    passed: boolean | null;
    rubricId: string;
    rubricVersion: string;
    scores: Array<{ id: string; score: number }>;
  };
  overallDelta: number;
  criterionDeltas: CriterionDelta[];
  rubricVersions: { a: string; b: string };
};

export function compareEvaluateRuns(
  a: StoredEvaluateRun,
  b: StoredEvaluateRun,
): CompareResult {
  const aScores = new Map(a.verdict.scores.map((score) => [score.id, score.score]));
  const bScores = new Map(b.verdict.scores.map((score) => [score.id, score.score]));
  const ids = [...new Set([...aScores.keys(), ...bScores.keys()])];
  const criterionDeltas: CriterionDelta[] = ids.map((id) => {
    const left = aScores.has(id) ? aScores.get(id)! : null;
    const right = bScores.has(id) ? bScores.get(id)! : null;
    return {
      id,
      a: left,
      b: right,
      delta: left === null || right === null ? null : right - left,
    };
  });

  return {
    a: {
      id: a.id,
      overall: a.verdict.overall,
      passed: a.verdict.passed,
      rubricId: a.rubricId,
      rubricVersion: a.rubricVersion,
      scores: a.verdict.scores.map((score) => ({
        id: score.id,
        score: score.score,
      })),
    },
    b: {
      id: b.id,
      overall: b.verdict.overall,
      passed: b.verdict.passed,
      rubricId: b.rubricId,
      rubricVersion: b.rubricVersion,
      scores: b.verdict.scores.map((score) => ({
        id: score.id,
        score: score.score,
      })),
    },
    overallDelta: b.verdict.overall - a.verdict.overall,
    criterionDeltas,
    rubricVersions: {
      a: a.rubricVersion,
      b: b.rubricVersion,
    },
  };
}
