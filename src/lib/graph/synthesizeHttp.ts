import {
  DEFAULT_SYNTHESIS_MODEL,
  isSynthesisConfigError,
  synthesizeQuestionsFromDocument,
  type SynthesizeComplete,
} from "./synthesize";

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
    prompt?: unknown;
    model?: unknown;
  };
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";
  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  const model =
    typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_SYNTHESIS_MODEL;

  if (!slug) {
    return Response.json(
      { ok: false, error: "slug is required", code: "precheck" },
      { status: 400 },
    );
  }
  if (!prompt.trim()) {
    return Response.json(
      { ok: false, error: "prompt is required", code: "precheck" },
      { status: 400 },
    );
  }

  try {
    if (process.env.EVAL_LLM_STUB === "1" && !options.complete) {
      const result = await synthesizeQuestionsFromDocument({
        slug,
        promptTemplate: prompt,
        model,
        complete: async () =>
          JSON.stringify({
            questions: [
              {
                question: `Stub question about ${slug}?`,
                expected_facts: [`Stub fact for ${slug}`],
                difficulty: "easy",
              },
            ],
          }),
      });
      return Response.json({ ok: true, ...result });
    }

    const result = await synthesizeQuestionsFromDocument({
      slug,
      promptTemplate: prompt,
      model,
      complete: options.complete,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Synthesis failed";
    if (isSynthesisConfigError(error)) {
      return Response.json(
        { ok: false, error: message, code: "config" },
        { status: 503 },
      );
    }
    if (/No text document found|empty full text/i.test(message)) {
      return Response.json(
        { ok: false, error: message, code: "precheck" },
        { status: 404 },
      );
    }
    if (/valid JSON|zero questions|missing question/i.test(message)) {
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
