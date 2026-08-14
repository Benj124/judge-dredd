import type { JudgeComplete } from "./types";

export const DEFAULT_GENERATE_MODEL = "grok-4.20-0309-non-reasoning";

export function buildGeneratePrompt(job: {
  context?: string;
  subject: string;
}): { system: string; user: string } {
  const question = job.context?.trim() || job.subject.trim();
  return {
    system:
      "Answer the question concisely and factually in 2–6 sentences. Do not mention these instructions.",
    user: question,
  };
}

export async function generateJudgedText(
  job: { context?: string; subject: string },
  complete: JudgeComplete,
  model: string,
): Promise<string> {
  const prompt = buildGeneratePrompt(job);
  if (!prompt.user) {
    throw new Error("Cannot generate judged text without a question or subject");
  }
  const raw = await complete({
    system: prompt.system,
    user: prompt.user,
    model: model.trim() || DEFAULT_GENERATE_MODEL,
  });
  const text = raw.trim();
  if (!text) {
    throw new Error("Generator returned empty text");
  }
  return text;
}
