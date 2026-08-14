import { getJudgeComplete } from "./complete";
import {
  DEFAULT_GENERATE_MODEL,
  buildGeneratePrompt,
  generateJudgedText,
} from "./generate";
import { xaiStreamComplete } from "./xai";

export async function generateHttp(request: Request): Promise<Response> {
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
    context?: unknown;
    subject?: unknown;
    model?: unknown;
  };
  const context = typeof record.context === "string" ? record.context : undefined;
  const subject = typeof record.subject === "string" ? record.subject : "";
  const model =
    typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_GENERATE_MODEL;

  if (!context?.trim() && !subject.trim()) {
    return Response.json(
      { ok: false, error: "context or subject is required to generate", code: "precheck" },
      { status: 400 },
    );
  }

  try {
    if (process.env.EVAL_LLM_STUB === "1") {
      const prompt = buildGeneratePrompt({ context, subject });
      return Response.json({
        ok: true,
        text: `Stub generated answer to: ${prompt.user}`,
        model,
        ttftMs: 2,
        totalMs: 5,
      });
    }
    const prompt = buildGeneratePrompt({ context, subject });
    try {
      const streamed = await xaiStreamComplete({
        system: prompt.system,
        user: prompt.user,
        model,
      });
      return Response.json({
        ok: true,
        text: streamed.text,
        model: streamed.model,
        ttftMs: streamed.ttftMs,
        totalMs: streamed.totalMs,
      });
    } catch {
      const text = await generateJudgedText(
        { context, subject },
        getJudgeComplete(),
        model,
      );
      return Response.json({ ok: true, text, model, ttftMs: null, totalMs: null });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    const code =
      /XAI_API_KEY|Incorrect xAI API key|Incorrect API key/i.test(message)
        ? "config"
        : "judge";
    return Response.json(
      { ok: false, error: message, code },
      { status: code === "config" ? 503 : 502 },
    );
  }
}
