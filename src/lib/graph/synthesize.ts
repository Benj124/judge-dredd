import {
  persistSynthesisVersion,
  publicDatasetItem,
  type PersistSynthesisResult,
} from "../db/datasetObject";
import {
  getSynthesisTemplate,
  getSynthesisTemplateByMode,
} from "../db/synthTemplates";
import { DEFAULT_JUDGE_MODEL } from "../eval/models";
import { XaiConfigError, xaiCompleteKey2 } from "../eval/xai";
import { coverageVsDocuments, type CoverageReport } from "./synthCoverage";
import { dedupQuestions, type DedupDrop } from "./synthDedup";
import {
  DEFAULT_DIFFICULTY_MIX,
  DEFAULT_N_PER_DOC,
  fillModeTemplate,
  isSynthesisMode,
  parseDifficultyMix,
  systemPromptForMode,
  countDifficultyMix,
  type DifficultyMix,
  type SynthesisMode,
  type SynthesisTemplate,
} from "./synthModes";
import { getTextDocumentBySlug, type TextDocument } from "./store";

export const DEFAULT_SYNTHESIS_MODEL = DEFAULT_JUDGE_MODEL;

export type SynthesizeComplete = (input: {
  system: string;
  user: string;
  model: string;
}) => Promise<string>;

export type RetrievedContextRef = {
  doc_uri?: string;
  slug?: string;
  content?: string;
};

export type SynthesizedQuestion = {
  question: string;
  expected_facts: string[];
  difficulty?: string;
  mode?: SynthesisMode;
  expected_retrieved_context?: RetrievedContextRef[];
  distractors?: string[];
  unanswerable?: boolean;
  source_slugs?: string[];
};

export type SynthesizeResult = {
  slug: string;
  title: string;
  canonicalUrl: string;
  model: string;
  questions: SynthesizedQuestion[];
  raw: string;
  mode: SynthesisMode;
  nPerDoc: number;
  difficultyMix: { requested: DifficultyMix; observed: DifficultyMix };
  coverage: CoverageReport;
  droppedDuplicates: DedupDrop[];
  templateId?: string;
  templateVersion?: string;
};

export type SynthesizePersistResult = SynthesizeResult & {
  datasetId: string;
  versionId: string;
  promptHash: string;
  items: ReturnType<typeof publicDatasetItem>[];
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
    const modeRaw =
      typeof row.mode === "string" ? row.mode.trim() : "";
    const mode = isSynthesisMode(modeRaw) ? modeRaw : undefined;

    const expected_retrieved_context = parseRetrievedContext(
      row.expected_retrieved_context ?? row.expectedRetrievedContext,
    );
    const distractors = Array.isArray(row.distractors)
      ? row.distractors
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    const source_slugs = Array.isArray(row.source_slugs)
      ? row.source_slugs
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    const unanswerable =
      row.unanswerable === true ||
      (typeof row.unanswerable === "string" &&
        row.unanswerable.trim().toLowerCase() === "true");

    const parsed: SynthesizedQuestion = { question, expected_facts, difficulty };
    if (mode) parsed.mode = mode;
    if (expected_retrieved_context?.length) {
      parsed.expected_retrieved_context = expected_retrieved_context;
    }
    if (distractors?.length) parsed.distractors = distractors;
    if (source_slugs?.length) parsed.source_slugs = source_slugs;
    if (unanswerable) parsed.unanswerable = true;
    return parsed;
  });
}

function parseRetrievedContext(value: unknown): RetrievedContextRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: RetrievedContextRef[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const ref: RetrievedContextRef = {};
    if (typeof item.doc_uri === "string" && item.doc_uri.trim()) {
      ref.doc_uri = item.doc_uri.trim();
    } else if (typeof item.docUri === "string" && item.docUri.trim()) {
      ref.doc_uri = item.docUri.trim();
    }
    if (typeof item.slug === "string" && item.slug.trim()) {
      ref.slug = item.slug.trim();
    }
    if (typeof item.content === "string" && item.content.trim()) {
      ref.content = item.content.trim();
    }
    if (ref.doc_uri || ref.slug || ref.content) rows.push(ref);
  }
  return rows.length > 0 ? rows : undefined;
}

export const SYNTHESIS_SYSTEM =
  "You synthesize grounded evaluation questions from a single source article. " +
  "Follow the user instructions exactly. Reply with JSON only — no markdown fences, no prose outside JSON.";

function stampMode(
  questions: SynthesizedQuestion[],
  mode: SynthesisMode,
): SynthesizedQuestion[] {
  return questions.map((question) => ({
    ...question,
    mode: question.mode ?? mode,
  }));
}

function assertModeShape(questions: SynthesizedQuestion[], mode: SynthesisMode): void {
  if (mode === "retrieval_gold") {
    const missing = questions.filter(
      (item) => !item.expected_retrieved_context?.length,
    );
    if (missing.length === questions.length) {
      throw new Error(
        "Retrieval-gold synthesis returned no expected_retrieved_context",
      );
    }
  }
  if (mode === "unanswerable") {
    const flagged = questions.filter((item) => item.unanswerable);
    if (flagged.length === 0) {
      throw new Error("Unanswerable synthesis returned no unanswerable items");
    }
  }
  if (mode === "distractor_facts") {
    const withTraps = questions.filter((item) => (item.distractors ?? []).length > 0);
    if (withTraps.length === 0) {
      throw new Error("Distractor-facts synthesis returned no distractors");
    }
  }
  if (mode === "multi_hop") {
    const hops = questions.filter(
      (item) => (item.source_slugs ?? []).length >= 2,
    );
    if (hops.length === 0) {
      throw new Error("Multi-hop synthesis returned no items with 2+ source_slugs");
    }
  }
}

export type SynthesizeOptions = {
  slug?: string;
  slugs?: string[];
  promptTemplate?: string;
  templateId?: string;
  templateVersion?: string;
  mode?: SynthesisMode;
  nPerDoc?: number;
  difficultyMix?: Partial<DifficultyMix> | DifficultyMix;
  model?: string;
  complete?: SynthesizeComplete;
};

export async function resolveSynthesisTemplate(options: {
  promptTemplate?: string;
  templateId?: string;
  templateVersion?: string;
  mode?: SynthesisMode;
}): Promise<{ template: SynthesisTemplate | null; body: string; mode: SynthesisMode }> {
  const mode: SynthesisMode = options.mode ?? "grounded_qa";
  if (options.promptTemplate?.trim()) {
    return {
      template: null,
      body: options.promptTemplate.trim(),
      mode,
    };
  }
  if (options.templateId?.trim()) {
    const stored = await getSynthesisTemplate(
      options.templateId.trim(),
      options.templateVersion?.trim() || "1",
    );
    if (!stored) {
      throw new Error(
        `No synthesis template "${options.templateId}" version "${options.templateVersion ?? "1"}"`,
      );
    }
    return { template: stored, body: stored.body, mode: options.mode ?? stored.mode };
  }
  const fromMode = await getSynthesisTemplateByMode(mode);
  return { template: fromMode, body: fromMode.body, mode: fromMode.mode };
}

export async function synthesizeQuestions(
  options: SynthesizeOptions,
): Promise<SynthesizeResult> {
  const slugs = [
    ...(options.slugs ?? []),
    ...(options.slug ? [options.slug] : []),
  ]
    .map((slug) => slug.trim())
    .filter(Boolean);
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) {
    throw new Error("Document slug is required");
  }

  const resolved = await resolveSynthesisTemplate({
    promptTemplate: options.promptTemplate,
    templateId: options.templateId,
    templateVersion: options.templateVersion,
    mode: options.mode,
  });
  const mode = resolved.mode;
  if (mode === "multi_hop" && uniqueSlugs.length < 2) {
    throw new Error("Multi-hop synthesis requires 2+ document slugs");
  }
  if (!resolved.body.trim()) {
    throw new Error("Synthesis prompt is required");
  }

  const docs: TextDocument[] = [];
  for (const slug of uniqueSlugs) {
    const doc = await getTextDocumentBySlug(slug);
    if (!doc) {
      throw new Error(`No text document found for slug "${slug}"`);
    }
    if (!doc.fullText.trim()) {
      throw new Error(`Document "${slug}" has empty full text`);
    }
    docs.push(doc);
  }

  const nPerDoc = Math.max(
    1,
    Math.floor(options.nPerDoc ?? DEFAULT_N_PER_DOC),
  );
  const difficultyMix = parseDifficultyMix(
    options.difficultyMix ?? DEFAULT_DIFFICULTY_MIX,
  );
  const nTotal = nPerDoc * docs.length;

  const model =
    options.model?.trim() ||
    process.env.SYNTHESIS_MODEL?.trim() ||
    DEFAULT_SYNTHESIS_MODEL;

  const user = fillModeTemplate(resolved.body, {
    docs,
    n: nTotal,
    difficultyMix,
  });
  const complete = options.complete ?? xaiCompleteKey2;
  const raw = await complete({
    system: systemPromptForMode(mode),
    user,
    model,
  });
  const parsed = stampMode(parseSynthesizedQuestions(raw), mode);
  assertModeShape(parsed, mode);
  const deduped = dedupQuestions(parsed);
  const questions = deduped.kept;
  const coverage = coverageVsDocuments(docs, questions);
  const primary = docs[0];

  return {
    slug: uniqueSlugs.length === 1 ? primary.slug : uniqueSlugs.join("+"),
    title:
      uniqueSlugs.length === 1
        ? primary.title
        : docs.map((doc) => doc.title).join(" + "),
    canonicalUrl: primary.canonicalUrl,
    model,
    questions,
    raw,
    mode,
    nPerDoc,
    difficultyMix: {
      requested: difficultyMix,
      observed: countDifficultyMix(questions),
    },
    coverage,
    droppedDuplicates: deduped.dropped,
    templateId: resolved.template?.id,
    templateVersion: resolved.template?.version,
  };
}

export async function synthesizeQuestionsFromDocument(options: {
  slug: string;
  promptTemplate: string;
  model?: string;
  complete?: SynthesizeComplete;
  mode?: SynthesisMode;
}): Promise<SynthesizeResult> {
  return synthesizeQuestions({
    slug: options.slug,
    promptTemplate: options.promptTemplate,
    model: options.model,
    complete: options.complete,
    mode: options.mode ?? "grounded_qa",
  });
}

export async function persistSynthesizeResult(
  result: SynthesizeResult,
  promptTemplate: string,
): Promise<PersistSynthesisResult> {
  return persistSynthesisVersion({
    sourceSlug: result.slug,
    prompt: promptTemplate,
    model: result.model,
    questions: result.questions,
    name: `Synthesis: ${result.title}`,
  });
}

export async function synthesizeAndPersist(
  options: SynthesizeOptions & { slug?: string; promptTemplate?: string },
): Promise<SynthesizePersistResult> {
  const result = await synthesizeQuestions(options);
  const promptForHash =
    options.promptTemplate?.trim() ||
    `${result.mode}:${result.templateId ?? ""}@${result.templateVersion ?? ""}`;
  const stored = await persistSynthesizeResult(result, promptForHash);
  return {
    ...result,
    datasetId: stored.dataset.id,
    versionId: stored.version.id,
    promptHash: stored.version.promptHash,
    items: stored.items.map(publicDatasetItem),
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
