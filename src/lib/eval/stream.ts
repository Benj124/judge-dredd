export function extractSseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const piece = json.choices?.[0]?.delta?.content;
    return typeof piece === "string" && piece.length > 0 ? piece : null;
  } catch {
    return null;
  }
}

export function accuracyFromScores(
  scores: Array<{ id: string; score: number }>,
  overall?: number,
): number | null {
  const accuracy = scores.find((score) => score.id === "accuracy");
  if (accuracy && Number.isFinite(accuracy.score)) return accuracy.score;
  if (typeof overall === "number" && Number.isFinite(overall)) return overall;
  return null;
}

export function runningMean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
