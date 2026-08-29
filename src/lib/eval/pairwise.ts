import { DEFAULT_JUDGE_MODEL, resolveJudgeModel } from "./models";
import type { JudgeComplete } from "./types";

export type PairwisePreference = "A" | "B" | "tie";

export type PairwiseResult = {
  preference: PairwisePreference;
  rationale: string;
  model: string;
};

export function parsePairwisePreference(raw: string): PairwisePreference {
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text) as { preference?: string; winner?: string };
    const value = (parsed.preference ?? parsed.winner ?? "").trim().toUpperCase();
    if (value === "A" || value === "B" || value === "TIE") {
      return value === "TIE" ? "tie" : value;
    }
  } catch {
    // fall through
  }
  if (/\bTIE\b/i.test(text) && !/\bA\b/.test(text) && !/\bB\b/.test(text)) {
    return "tie";
  }
  const a = (text.match(/\bA\b/g) ?? []).length;
  const b = (text.match(/\bB\b/g) ?? []).length;
  if (/\btie\b/i.test(text)) return "tie";
  if (a && !b) return "A";
  if (b && !a) return "B";
  return "tie";
}

export async function comparePairwise(options: {
  a: string;
  b: string;
  context?: string;
  complete: JudgeComplete;
  model?: string;
}): Promise<PairwiseResult> {
  const resolved = resolveJudgeModel(options.model ?? DEFAULT_JUDGE_MODEL);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  const raw = await options.complete({
    model: resolved.model,
    system:
      "You compare two candidate answers A and B. Reply with JSON only: " +
      '{"preference":"A"|"B"|"tie","rationale":"..."}. This does not replace pointwise 1–5 scoring.',
    user: JSON.stringify({
      context: options.context ?? null,
      A: options.a,
      B: options.b,
    }),
  });
  let rationale = raw.trim();
  try {
    const parsed = JSON.parse(raw) as { rationale?: string };
    if (typeof parsed.rationale === "string" && parsed.rationale.trim()) {
      rationale = parsed.rationale.trim();
    }
  } catch {
    // keep raw
  }
  return {
    preference: parsePairwisePreference(raw),
    rationale,
    model: resolved.model,
  };
}
