import { DEFAULT_JUDGE_MODEL } from "../eval/models";
import { XaiConfigError, xaiCompleteKey2 } from "../eval/xai";
import { getTextDocumentBySlug, type TextDocument } from "./store";

export const DEFAULT_SYNTHESIS_MODEL = DEFAULT_JUDGE_MODEL;

export type SynthesizeComplete = (input: {
  system: string;
  user: string;
  model: string;
}) => Promise<string>;

export type SynthesizedQuestion = {
  question: string;
  expected_facts: string[];
  difficulty?: string;
};

export type SynthesizeResult = {
  slug: string;
  title: string;
  canonicalUrl: string;
  model: string;
  questions: SynthesizedQuestion[];
  raw: string;
};

export function fillSynthesisPrompt(
  template: string,
  doc: Pick<TextDocument, "title" | "canonicalUrl" | "fullText">,
): string {
  return template
    .replaceAll("{{title}}", doc.title)
    .replaceAll("{{url}}", doc.canonicalUrl)
    .replaceAll("{{full_text}}", doc.fullText);
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSynthesizedQuestions(raw: string): SynthesizedQuestion[] {
  const text = stripJsonFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(text.slice(start, end + 1));
    } else {
      throw new Error("Synthesis response was not valid JSON");
    }
  }

  let rows: unknown[] = [];
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.questions)) {
    rows = parsed.questions;
  } else {
    throw new Error('Synthesis JSON must be { "questions": [...] } or an array');
  }

  if (rows.length === 0) {
    throw new Error("Synthesis returned zero questions");
  }

  return rows.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`Question at index ${index} is not an object`);
    }
    const question =
      typeof row.question === "string"
        ? row.question.trim()
        : typeof row.context === "string"
          ? row.context.trim()
          : "";
    if (!question) {
      throw new Error(`Question at index ${index} is missing question text`);
    }
    let expected_facts: string[] = [];
    if (Array.isArray(row.expected_facts)) {
      expected_facts = row.expected_facts
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (typeof row.expected_facts === "string" && row.expected_facts.trim()) {
      expected_facts = [row.expected_facts.trim()];
    } else if (typeof row.reference === "string" && row.reference.trim()) {
      expected_facts = [row.reference.trim()];
    }
    const difficulty =
      typeof row.difficulty === "string" && row.difficulty.trim()
        ? row.difficulty.trim()
        : undefined;
    return { question, expected_facts, difficulty };
  });
}

export const SYNTHESIS_SYSTEM =
  "You synthesize grounded evaluation questions from a single source article. " +
  "Follow the user instructions exactly. Reply with JSON only — no markdown fences, no prose outside JSON.";

export async function synthesizeQuestionsFromDocument(options: {
  slug: string;
  promptTemplate: string;
  model?: string;
  complete?: SynthesizeComplete;
}): Promise<SynthesizeResult> {
  const slug = options.slug.trim();
  if (!slug) {
    throw new Error("Document slug is required");
  }
  const promptTemplate = options.promptTemplate.trim();
  if (!promptTemplate) {
    throw new Error("Synthesis prompt is required");
  }

  const doc = await getTextDocumentBySlug(slug);
  if (!doc) {
    throw new Error(`No text document found for slug "${slug}"`);
  }
  if (!doc.fullText.trim()) {
    throw new Error(`Document "${slug}" has empty full text`);
  }

  const model =
    options.model?.trim() ||
    process.env.SYNTHESIS_MODEL?.trim() ||
    DEFAULT_SYNTHESIS_MODEL;

  const user = fillSynthesisPrompt(promptTemplate, doc);
  const complete = options.complete ?? xaiCompleteKey2;
  const raw = await complete({
    system: SYNTHESIS_SYSTEM,
    user,
    model,
  });
  const questions = parseSynthesizedQuestions(raw);

  return {
    slug: doc.slug,
    title: doc.title,
    canonicalUrl: doc.canonicalUrl,
    model,
    questions,
    raw,
  };
}

export function isSynthesisConfigError(error: unknown): boolean {
  return (
    error instanceof XaiConfigError ||
    (error instanceof Error &&
      /XAI_API_KEY2|XAI_API_KEY is not set|Incorrect XAI_API_KEY2/i.test(
        error.message,
      ))
  );
}
