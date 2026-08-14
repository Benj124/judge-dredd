import type { Rubric } from "./types";

export function aggregateOverall(
  rubric: Rubric,
  scores: Record<string, number>,
): number {
  const totalWeight = rubric.criteria.reduce(
    (sum, criterion) => sum + criterion.weight,
    0,
  );
  if (totalWeight <= 0) {
    throw new Error("Rubric weights must sum to a positive number");
  }
  const weighted = rubric.criteria.reduce((sum, criterion) => {
    const score = scores[criterion.id];
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new Error(`Missing numeric score for criterion "${criterion.id}"`);
    }
    return sum + score * criterion.weight;
  }, 0);
  return weighted / totalWeight;
}

export function overallPassed(
  rubric: Rubric,
  scores: Record<string, number>,
  overall: number,
): boolean | null {
  if (rubric.overallPassRule === "all_must_pass") {
    return rubric.criteria.every((criterion) => {
      const threshold =
        criterion.passThreshold ??
        rubric.overallPassThreshold ??
        criterion.scale.min;
      return scores[criterion.id] >= threshold;
    });
  }

  if (rubric.overallPassRule === "weighted_average") {
    if (typeof rubric.overallPassThreshold !== "number") {
      return null;
    }
    return overall >= rubric.overallPassThreshold;
  }

  return null;
}
