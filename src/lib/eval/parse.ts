import type { CriterionScore, Rubric } from "./types";

export type ParsedJudgeOutput = {
  scores: CriterionScore[];
  rationale: string;
};

export function parseJudgeJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Judge returned an empty response");
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : trimmed).trim();
  return JSON.parse(text) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractJudgeOutput(raw: unknown): ParsedJudgeOutput {
  if (!isRecord(raw)) {
    throw new Error("Judge output must be a JSON object");
  }
  if (typeof raw.rationale !== "string" || !raw.rationale.trim()) {
    throw new Error("Judge output is missing a rationale string");
  }
  if (!Array.isArray(raw.scores)) {
    throw new Error("Judge output is missing a scores array");
  }

  const scores: CriterionScore[] = raw.scores.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Judge score at index ${index} is not an object`);
    }
    if (typeof entry.id !== "string" || !entry.id) {
      throw new Error(`Judge score at index ${index} is missing an id`);
    }
    if (typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
      throw new Error(`Judge score for "${entry.id}" is not a finite number`);
    }
    const rationale =
      typeof entry.rationale === "string" ? entry.rationale : undefined;
    return { id: entry.id, score: entry.score, rationale };
  });

  return { scores, rationale: raw.rationale.trim() };
}

export function scoresById(
  scores: CriterionScore[],
  rubric: Rubric,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const criterion of rubric.criteria) {
    const match = scores.find((score) => score.id === criterion.id);
    if (!match) {
      throw new Error(`Missing score for criterion "${criterion.id}"`);
    }
    if (match.score < criterion.scale.min || match.score > criterion.scale.max) {
      throw new Error(
        `Score for "${criterion.id}" (${match.score}) is outside ${criterion.scale.min}–${criterion.scale.max}`,
      );
    }
    map[criterion.id] = match.score;
  }
  return map;
}
