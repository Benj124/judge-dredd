import type { JudgeComplete } from "./types";
import { xaiComplete } from "./xai";

/** Deterministic stand-in used when EVAL_LLM_STUB=1 so HTTP tests never hit xAI. */
export const stubComplete: JudgeComplete = async ({ user }) => {
  const ids = [...user.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
  const unique = [...new Set(ids)].filter((id) => id !== "default");
  const criterionIds = unique.length > 0 ? unique : ["accuracy"];
  return JSON.stringify({
    scores: criterionIds.map((id) => ({
      id,
      score: 4,
      rationale: `stub score for ${id}`,
    })),
    rationale: "Stub judge: injected completion, no live model.",
  });
};

export function getJudgeComplete(
  env: NodeJS.ProcessEnv = process.env,
): JudgeComplete {
  if (env.EVAL_LLM_STUB === "1") {
    return stubComplete;
  }
  return xaiComplete;
}
