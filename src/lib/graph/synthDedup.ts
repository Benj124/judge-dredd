import { jaccard, tokenize } from "./synthCoverage";

export type DedupDrop = {
  question: string;
  duplicateOf: string;
  score: number;
};

export type DedupResult<T extends { question: string }> = {
  kept: T[];
  dropped: DedupDrop[];
};

const DEFAULT_THRESHOLD = 0.55;

export function questionSimilarity(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}

/**
 * Drop near-duplicate questions (Jaccard on tokens). First occurrence wins.
 */
export function dedupQuestions<T extends { question: string }>(
  questions: T[],
  threshold = DEFAULT_THRESHOLD,
): DedupResult<T> {
  const kept: T[] = [];
  const dropped: DedupDrop[] = [];
  for (const item of questions) {
    const match = kept.find((existing) => {
      const score = questionSimilarity(existing.question, item.question);
      return score >= threshold;
    });
    if (match) {
      dropped.push({
        question: item.question,
        duplicateOf: match.question,
        score: questionSimilarity(match.question, item.question),
      });
      continue;
    }
    kept.push(item);
  }
  return { kept, dropped };
}
