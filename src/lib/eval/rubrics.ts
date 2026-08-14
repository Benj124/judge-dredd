import {
  getStoredRubric,
  listStoredRubrics,
} from "../db/store";
import type { Rubric } from "./types";

export const DEFAULT_RUBRIC_ID = "default";

export const DEFAULT_RUBRIC: Rubric = {
  id: DEFAULT_RUBRIC_ID,
  version: "1",
  name: "Default pointwise",
  description:
    "Accuracy, faithfulness/groundedness, completeness, and clarity on a 1–5 scale.",
  overallPassRule: "weighted_average",
  overallPassThreshold: 3,
  criteria: [
    {
      id: "accuracy",
      name: "Accuracy",
      description:
        "Factual correctness of the subject relative to the reference when present, otherwise internal correctness.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
    {
      id: "faithfulness",
      name: "Faithfulness",
      description:
        "How well the subject stays grounded in the provided context and/or reference. If neither is provided, score internal consistency and whether the subject invents unsupported constraints.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
    {
      id: "completeness",
      name: "Completeness",
      description:
        "Whether the subject covers the request and material that the context or reference implies should be addressed.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
    {
      id: "clarity",
      name: "Clarity",
      description: "How clear, organized, and understandable the subject is.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
  ],
};

/** Context-grounded answers (RAG / retrieval): penalize unsupported claims. */
export const GROUNDED_RESPONSE_PROMPT: Rubric = {
  id: "grounded-response",
  version: "1",
  name: "Grounded response",
  description:
    "For answers that must stay faithful to provided context or sources. Weights faithfulness highest.",
  overallPassRule: "weighted_average",
  overallPassThreshold: 3,
  criteria: [
    {
      id: "faithfulness",
      name: "Faithfulness",
      description:
        "Claims in the subject must be supported by the context and/or reference. Penalize invented facts, numbers, or constraints not present in the sources.",
      scale: { min: 1, max: 5 },
      weight: 2,
      passThreshold: 3,
    },
    {
      id: "relevance",
      name: "Relevance",
      description:
        "Whether the subject answers the user’s question or task implied by the context, without long off-topic digressions.",
      scale: { min: 1, max: 5 },
      weight: 1.5,
      passThreshold: 3,
    },
    {
      id: "citation_use",
      name: "Source use",
      description:
        "Whether the subject uses the provided context effectively (quotes, paraphrases, or clearly tied details) rather than ignoring it.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
    {
      id: "clarity",
      name: "Clarity",
      description: "How clear and readable the grounded answer is.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
  ],
};

/** Summaries: coverage of source, fidelity, and concision. */
export const SUMMARY_QUALITY_PROMPT: Rubric = {
  id: "summary-quality",
  version: "1",
  name: "Summary quality",
  description:
    "For summarization of a longer source (put the source in context or reference). Scores coverage, fidelity, and concision.",
  overallPassRule: "weighted_average",
  overallPassThreshold: 3,
  criteria: [
    {
      id: "coverage",
      name: "Coverage",
      description:
        "Whether the summary captures the main points and important details of the source without major omissions.",
      scale: { min: 1, max: 5 },
      weight: 1.5,
      passThreshold: 3,
    },
    {
      id: "fidelity",
      name: "Fidelity",
      description:
        "Whether the summary accurately reflects the source and does not distort meaning or invent content.",
      scale: { min: 1, max: 5 },
      weight: 2,
      passThreshold: 3,
    },
    {
      id: "concision",
      name: "Concision",
      description:
        "Whether the summary is appropriately compact without unnecessary repetition or filler.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
    {
      id: "structure",
      name: "Structure",
      description:
        "Whether the summary is well-organized and easy to scan (logical order, coherent paragraphs or bullets).",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
  ],
};

/** Task / instruction following: did the subject do what was asked. */
export const INSTRUCTION_FOLLOWING_PROMPT: Rubric = {
  id: "instruction-following",
  version: "1",
  name: "Instruction following",
  description:
    "For checking that an output follows the user’s instructions (put the instructions in context). Emphasizes compliance and format.",
  overallPassRule: "all_must_pass",
  overallPassThreshold: 3,
  criteria: [
    {
      id: "compliance",
      name: "Compliance",
      description:
        "Whether the subject satisfies the explicit requirements and constraints stated in the context instructions.",
      scale: { min: 1, max: 5 },
      weight: 2,
      passThreshold: 3,
    },
    {
      id: "format",
      name: "Format",
      description:
        "Whether the subject matches any requested structure, length, tone, or output format (e.g. JSON, bullets, step list).",
      scale: { min: 1, max: 5 },
      weight: 1.5,
      passThreshold: 3,
    },
    {
      id: "completeness",
      name: "Completeness",
      description:
        "Whether all parts of a multi-part instruction are addressed.",
      scale: { min: 1, max: 5 },
      weight: 1.5,
      passThreshold: 3,
    },
    {
      id: "clarity",
      name: "Clarity",
      description: "Whether the response is clear enough to use as delivered.",
      scale: { min: 1, max: 5 },
      weight: 1,
      passThreshold: 3,
    },
  ],
};

const RUBRICS: Rubric[] = [
  DEFAULT_RUBRIC,
  GROUNDED_RESPONSE_PROMPT,
  SUMMARY_QUALITY_PROMPT,
  INSTRUCTION_FOLLOWING_PROMPT,
];

/** Built-in evaluation prompts only (no DB). Safe for tests and offline paths. */
export function listRubrics(): Rubric[] {
  return RUBRICS;
}

/** Built-in evaluation prompts only (no DB). */
export function getRubric(id: string): Rubric | undefined {
  return RUBRICS.find((rubric) => rubric.id === id);
}

/**
 * Resolve a rubric by id: built-in first, then local Postgres store.
 * Returns undefined when neither has the id (or DB is unreachable for store-only ids).
 */
export async function resolveRubric(
  id: string,
): Promise<Rubric | undefined> {
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  const builtIn = getRubric(trimmed);
  if (builtIn) return builtIn;
  try {
    const stored = await getStoredRubric(trimmed);
    return stored ?? undefined;
  } catch {
    return undefined;
  }
}

/** Built-ins plus DB-stored rubrics (built-in wins on id collision). */
export async function listAllRubrics(): Promise<Rubric[]> {
  const builtIn = listRubrics();
  const byId = new Map(builtIn.map((rubric) => [rubric.id, rubric]));
  try {
    const stored = await listStoredRubrics();
    for (const rubric of stored) {
      if (!byId.has(rubric.id)) {
        byId.set(rubric.id, rubric);
      }
    }
  } catch {
    // DB optional for listing; still return built-ins.
  }
  return [...byId.values()];
}
