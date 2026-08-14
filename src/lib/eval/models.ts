/** Cheap non-reasoning Grok — not a flagship/frontier alias. */
export const DEFAULT_JUDGE_MODEL = "grok-4.20-0309-non-reasoning";

const FRONTIER_MODELS = new Set([
  "grok-4",
  "grok-4-latest",
  "grok-4.5",
  "grok-4.5-latest",
  "grok-4.6",
  "grok-4.6-latest",
]);

export function isFrontierModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (FRONTIER_MODELS.has(id)) return true;
  return /^grok-4\.(5|6)($|-)/.test(id);
}

export function resolveJudgeModel(
  modelOverride?: string,
): { ok: true; model: string } | { ok: false; error: string } {
  const model = modelOverride?.trim() || process.env.JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL;
  if (isFrontierModel(model)) {
    return {
      ok: false,
      error: `Judge model "${model}" is a frontier/flagship alias; use a low-cost model`,
    };
  }
  return { ok: true, model };
}
