import type { Rubric } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScale(value: unknown): { min: number; max: number } | null {
  if (!isRecord(value)) return null;
  if (typeof value.min !== "number" || typeof value.max !== "number") return null;
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) return null;
  if (value.min > value.max) return null;
  return { min: value.min, max: value.max };
}

export function parseRubric(value: unknown): Rubric | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.version !== "string" || !value.version.trim()) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  if (value.overallPassRule !== "all_must_pass" && value.overallPassRule !== "weighted_average") {
    return null;
  }
  if (!Array.isArray(value.criteria) || value.criteria.length === 0) return null;

  const criteria: Rubric["criteria"] = [];
  const seen = new Set<string>();
  for (const entry of value.criteria) {
    if (!isRecord(entry)) return null;
    if (typeof entry.id !== "string" || !entry.id.trim()) return null;
    if (seen.has(entry.id)) return null;
    seen.add(entry.id);
    if (typeof entry.name !== "string" || !entry.name.trim()) return null;
    if (typeof entry.description !== "string") return null;
    if (typeof entry.weight !== "number" || !(entry.weight > 0)) return null;
    const scale = parseScale(entry.scale);
    if (!scale) return null;
    const criterion: Rubric["criteria"][number] = {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      scale,
      weight: entry.weight,
    };
    if (typeof entry.passThreshold === "number") {
      criterion.passThreshold = entry.passThreshold;
    }
    criteria.push(criterion);
  }

  const rubric: Rubric = {
    id: value.id.trim(),
    version: value.version.trim(),
    name: value.name.trim(),
    description: typeof value.description === "string" ? value.description : "",
    criteria,
    overallPassRule: value.overallPassRule,
  };
  if (typeof value.overallPassThreshold === "number") {
    rubric.overallPassThreshold = value.overallPassThreshold;
  }
  return rubric;
}
