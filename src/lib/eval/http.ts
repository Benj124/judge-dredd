import {
  getAgenticOptions,
  saveAgenticOptions,
  saveEvaluateRun,
  saveStoredRubric,
  type AgenticOptions,
} from "../db/store";
import { getEmbedder } from "../rag/embed";
import { hybridRetrieve } from "../rag/retrieve";
import { getJudgeComplete } from "./complete";
import { parseRubric } from "./parseRubric";
import { evaluatePointwise } from "./pipeline";
import { listAllRubrics, resolveRubric } from "./rubrics";
import type { Rubric, Verdict } from "./types";

const STATUS: Record<string, number> = {
  precheck: 400,
  postcheck: 422,
  judge: 502,
  config: 503,
};

function publicRubric(rubric: Rubric) {
  return {
    id: rubric.id,
    version: rubric.version,
    name: rubric.name,
    description: rubric.description,
    overallPassRule: rubric.overallPassRule,
    overallPassThreshold: rubric.overallPassThreshold,
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      description: criterion.description,
      scale: criterion.scale,
      weight: criterion.weight,
      passThreshold: criterion.passThreshold,
    })),
  };
}

export async function evaluateHttp(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body", code: "precheck" },
      { status: 400 },
    );
  }

  let storedModel: string | undefined;
  try {
    const options = await getAgenticOptions();
    storedModel = options.judgeModel;
  } catch {
    storedModel = undefined;
  }

  const embed = getEmbedder();
  const result = await evaluatePointwise(body, {
    complete: getJudgeComplete(),
    model: storedModel,
    resolveRubricId: (id) => resolveRubric(id),
    retrieve: (query) => hybridRetrieve(query, { embed }),
  });

  if (!result.ok) {
    return Response.json(result, { status: STATUS[result.code] ?? 500 });
  }

  const runId = await persistVerdict(body, result.verdict);
  if (runId) {
    return Response.json({ ...result, runId });
  }
  return Response.json(result);
}

async function persistVerdict(
  body: unknown,
  verdict: Verdict,
): Promise<string | undefined> {
  if (!body || typeof body !== "object") return undefined;
  const record = body as {
    subject?: unknown;
    context?: unknown;
    reference?: unknown;
    fixtureId?: unknown;
    campaignId?: unknown;
  };
  if (typeof record.subject !== "string") return undefined;
  try {
    const stored = await saveEvaluateRun({
      subject: record.subject,
      context: typeof record.context === "string" ? record.context : null,
      reference: typeof record.reference === "string" ? record.reference : null,
      fixtureId: typeof record.fixtureId === "string" ? record.fixtureId : null,
      campaignId: typeof record.campaignId === "string" ? record.campaignId : null,
      verdict,
    });
    return stored.id;
  } catch {
    return undefined;
  }
}

export async function listRubricsHttp(): Promise<Response> {
  const rubrics = await listAllRubrics();
  return Response.json({
    ok: true,
    rubrics: rubrics.map(publicRubric),
  });
}

export async function saveRubricHttp(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body", code: "precheck" },
      { status: 400 },
    );
  }

  const parsed = parseRubric(body);
  if (!parsed) {
    return Response.json(
      { ok: false, error: "rubric is invalid", code: "precheck" },
      { status: 400 },
    );
  }
  if (parsed.id === "default") {
    return Response.json(
      {
        ok: false,
        error: 'Cannot overwrite built-in rubric id "default"',
        code: "precheck",
      },
      { status: 400 },
    );
  }

  try {
    const saved = await saveStoredRubric(parsed);
    return Response.json({ ok: true, rubric: publicRubric(saved) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save rubric";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}

export async function getAgenticOptionsHttp(): Promise<Response> {
  try {
    const options = await getAgenticOptions();
    return Response.json({ ok: true, options: publicOptions(options) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load agentic options";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}

export async function saveAgenticOptionsHttp(
  request: Request,
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

  const record =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  const nested =
    record && record.options && typeof record.options === "object"
      ? (record.options as Record<string, unknown>)
      : record;
  if (!nested || typeof nested.judgeModel !== "string" || !nested.judgeModel.trim()) {
    return Response.json(
      { ok: false, error: "judgeModel is required", code: "precheck" },
      { status: 400 },
    );
  }

  try {
    const saved = await saveAgenticOptions({ judgeModel: nested.judgeModel });
    return Response.json({ ok: true, options: publicOptions(saved) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save agentic options";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}

export async function listDatasetHttp(): Promise<Response> {
  try {
    const { listDatasetRows } = await import("../db/dataset");
    const rows = await listDatasetRows();
    return Response.json({
      ok: true,
      jobs: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        context: row.context,
        reference: row.reference,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list dataset";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}

function publicOptions(options: AgenticOptions) {
  return {
    judgeModel: options.judgeModel,
    updatedAt: options.updatedAt ?? null,
  };
}
