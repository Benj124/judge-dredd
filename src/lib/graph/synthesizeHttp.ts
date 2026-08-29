import { listSynthesisTemplates } from "../db/synthTemplates";
import {
  DEFAULT_N_PER_DOC,
  isSynthesisMode,
  parseDifficultyMix,
  type SynthesisMode,
} from "./synthModes";
import {
  DEFAULT_SYNTHESIS_MODEL,
  isSynthesisConfigError,
  synthesizeAndPersist,
  type SynthesizeComplete,
} from "./synthesize";

export async function listSynthesisTemplatesHttp(): Promise<Response> {
  try {
    const templates = await listSynthesisTemplates();
    return Response.json({ ok: true, templates });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list templates";
    return Response.json({ ok: false, error: message, code: "config" }, { status: 503 });
  }
}

export async function synthesizeHttp(
  request: Request,
  options: { complete?: SynthesizeComplete } = {},
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body", code: "precheck" },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return Response.json(
      { ok: false, error: "Request body must be an object", code: "precheck" },
      { status: 400 },
    );
  }

  const record = body as {
    slug?: unknown;
    slugs?: unknown;
    prompt?: unknown;
    model?: unknown;
    mode?: unknown;
    nPerDoc?: unknown;
    difficultyMix?: unknown;
    templateId?: unknown;
    templateVersion?: unknown;
  };
  const slugs = [
    ...(Array.isArray(record.slugs)
      ? record.slugs.filter((item): item is string => typeof item === "string")
      : []),
    ...(typeof record.slug === "string" ? [record.slug] : []),
  ]
    .map((slug) => slug.trim())
    .filter(Boolean);

  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  const templateId =
    typeof record.templateId === "string" ? record.templateId.trim() : "";
  const templateVersion =
    typeof record.templateVersion === "string"
      ? record.templateVersion.trim()
      : undefined;
  const modeRaw = typeof record.mode === "string" ? record.mode.trim() : "";
  const mode: SynthesisMode | undefined = isSynthesisMode(modeRaw)
    ? modeRaw
    : undefined;
  const model =
    typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_SYNTHESIS_MODEL;
  const nPerDoc =
    typeof record.nPerDoc === "number"
      ? record.nPerDoc
      : typeof record.nPerDoc === "string"
        ? Number(record.nPerDoc)
        : DEFAULT_N_PER_DOC;
  const difficultyMix = parseDifficultyMix(record.difficultyMix);

  if (slugs.length === 0) {
    return Response.json(
      { ok: false, error: "slug is required", code: "precheck" },
      { status: 400 },
    );
  }
  if (!prompt.trim() && !templateId && !mode) {
    return Response.json(
      { ok: false, error: "prompt, templateId, or mode is required", code: "precheck" },
      { status: 400 },
    );
  }

  try {
    const stubComplete: SynthesizeComplete | undefined =
      process.env.EVAL_LLM_STUB === "1" && !options.complete
        ? async () => {
            const resolvedMode = mode ?? "grounded_qa";
            const question: Record<string, unknown> = {
              question: `Stub question about ${slugs[0]}?`,
              expected_facts: [`Stub fact for ${slugs[0]}`],
              difficulty: "easy",
              mode: resolvedMode,
            };
            if (resolvedMode === "unanswerable") {
              question.unanswerable = true;
              question.expected_facts = ["Not stated in the source."];
            }
            if (resolvedMode === "distractor_facts") {
              question.distractors = ["False distractor fact"];
            }
            if (resolvedMode === "multi_hop") {
              question.source_slugs = slugs.length >= 2 ? slugs.slice(0, 2) : [slugs[0], "other"];
            }
            if (resolvedMode === "retrieval_gold") {
              question.expected_retrieved_context = [
                { doc_uri: `https://example.test/${slugs[0]}`, content: `Stub fact for ${slugs[0]}` },
              ];
            }
            return JSON.stringify({ questions: [question] });
          }
        : undefined;

    const result = await synthesizeAndPersist({
      slug: slugs[0],
      slugs,
      promptTemplate: prompt.trim() || undefined,
      templateId: templateId || undefined,
      templateVersion,
      mode,
      nPerDoc,
      difficultyMix,
      model,
      complete: options.complete ?? stubComplete,
    });
    return Response.json({
      ok: true,
      slug: result.slug,
      title: result.title,
      canonicalUrl: result.canonicalUrl,
      model: result.model,
      questions: result.questions,
      raw: result.raw,
      mode: result.mode,
      nPerDoc: result.nPerDoc,
      difficultyMix: result.difficultyMix,
      coverage: result.coverage,
      droppedDuplicates: result.droppedDuplicates,
      templateId: result.templateId ?? null,
      templateVersion: result.templateVersion ?? null,
      datasetId: result.datasetId,
      versionId: result.versionId,
      promptHash: result.promptHash,
      items: result.items,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Synthesis failed";
    if (isSynthesisConfigError(error)) {
      return Response.json(
        { ok: false, error: message, code: "config" },
        { status: 503 },
      );
    }
    if (/No text document found|empty full text|2\+ document/i.test(message)) {
      return Response.json(
        { ok: false, error: message, code: "precheck" },
        { status: 404 },
      );
    }
    if (
      /valid JSON|zero questions|missing question|expected_retrieved_context|unanswerable|distractors|source_slugs/i.test(
        message,
      )
    ) {
      return Response.json(
        { ok: false, error: message, code: "parse" },
        { status: 502 },
      );
    }
    return Response.json(
      { ok: false, error: message, code: "judge" },
      { status: 502 },
    );
  }
}
