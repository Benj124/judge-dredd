export type RankedHit = { id: string; rank: number };

export function reciprocalRankFuse(
  lists: RankedHit[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const hit of list) {
      const next = (scores.get(hit.id) ?? 0) + 1 / (k + hit.rank);
      scores.set(hit.id, next);
    }
  }
  return scores;
}
