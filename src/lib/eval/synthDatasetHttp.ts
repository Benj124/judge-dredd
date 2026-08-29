import {
  listGoldItems,
  listVersionItems,
  publicDatasetItem,
  reviewDatasetItem,
  type ReviewAction,
} from "../db/datasetObject";
import { getJudgeComplete, stubComplete } from "./complete";
import { runGoldDatasetCampaign } from "./datasetCampaign";
import { exportGoldVersion, importGoldText } from "./datasetIo";
import { DEFAULT_GENERATE_MODEL, generateJudgedText } from "./generate";
import type { JudgeComplete } from "./types";

const REVIEW_ACTIONS = new Set<ReviewAction>(["keep", "edit", "reject"]);

function jsonError(status: number, error: string, code: string): Response {
  return Response.json({ ok: false, error, code }, { status });
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Invalid JSON body", "precheck") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      response: jsonError(400, "Request body must be an object", "precheck"),
    };
  }
  return { ok: true, body: body as Record<string, unknown> };
}

export async function reviewDatasetHttp(request: Request): Promise<Response> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const itemId =
    typeof parsed.body.itemId === "string" ? parsed.body.itemId.trim() : "";
  const actionRaw =
    typeof parsed.body.action === "string" ? parsed.body.action.trim().toLowerCase() : "";
  if (!itemId) {
    return jsonError(400, "itemId is required", "precheck");
  }
  if (!REVIEW_ACTIONS.has(actionRaw as ReviewAction)) {
    return jsonError(400, "action must be keep, edit, or reject", "precheck");
  }
  const action = actionRaw as ReviewAction;
  const question =
    typeof parsed.body.question === "string" ? parsed.body.question : undefined;
  let expectedFacts: string[] | undefined;
  if (Array.isArray(parsed.body.expected_facts)) {
    expectedFacts = parsed.body.expected_facts.filter(
      (item): item is string => typeof item === "string",
    );
  } else if (Array.isArray(parsed.body.expectedFacts)) {
    expectedFacts = parsed.body.expectedFacts.filter(
      (item): item is string => typeof item === "string",
    );
  }

  try {
    const item = await reviewDatasetItem({
      itemId,
      action,
      question,
      expectedFacts,
    });
    return Response.json({ ok: true, item: publicDatasetItem(item) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed";
    const status = /No dataset item found/i.test(message) ? 404 : 400;
    return jsonError(status, message, status === 404 ? "precheck" : "precheck");
  }
}

export async function exportDatasetHttp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId")?.trim() ?? "";
  const formatRaw = url.searchParams.get("format")?.trim().toLowerCase() ?? "jsonl";
  if (!versionId) {
    return jsonError(400, "versionId is required", "precheck");
  }
  if (formatRaw !== "jsonl" && formatRaw !== "csv") {
    return jsonError(400, "format must be jsonl or csv", "precheck");
  }
  try {
    const exported = await exportGoldVersion(versionId, formatRaw);
    return new Response(exported.body, {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const status = /No gold items/i.test(message) ? 404 : 400;
    return jsonError(status, message, "precheck");
  }
}

export async function importDatasetHttp(request: Request): Promise<Response> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const text = typeof parsed.body.text === "string" ? parsed.body.text : "";
  const formatRaw =
    typeof parsed.body.format === "string"
      ? parsed.body.format.trim().toLowerCase()
      : "jsonl";
  const datasetSlug =
    typeof parsed.body.datasetSlug === "string"
      ? parsed.body.datasetSlug.trim()
      : undefined;
  if (!text.trim()) {
    return jsonError(400, "text is required", "precheck");
  }
  if (formatRaw !== "jsonl" && formatRaw !== "csv") {
    return jsonError(400, "format must be jsonl or csv", "precheck");
  }
  try {
    const stored = await importGoldText({
      text,
      format: formatRaw,
      datasetSlug,
    });
    return Response.json({
      ok: true,
      datasetId: stored.dataset.id,
      versionId: stored.version.id,
      items: stored.items.map(publicDatasetItem),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return jsonError(400, message, "precheck");
  }
}

export async function listDatasetItemsHttp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId")?.trim() ?? "";
  const goldOnly = url.searchParams.get("gold") === "1";
  if (!versionId) {
    return jsonError(400, "versionId is required", "precheck");
  }
  try {
    const items = goldOnly
      ? await listGoldItems(versionId)
      : await listVersionItems(versionId);
    return Response.json({
      ok: true,
      items: items.map(publicDatasetItem),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "List failed";
    return jsonError(503, message, "config");
  }
}

export async function campaignFromGoldHttp(
  request: Request,
  options: {
    complete?: JudgeComplete;
    generate?: (input: { context?: string; subject: string }) => Promise<string>;
  } = {},
): Promise<Response> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const versionId =
    typeof parsed.body.versionId === "string" ? parsed.body.versionId.trim() : "";
  if (!versionId) {
    return jsonError(400, "versionId is required", "precheck");
  }
  const model =
    typeof parsed.body.model === "string" && parsed.body.model.trim()
      ? parsed.body.model.trim()
      : DEFAULT_GENERATE_MODEL;
  const seed =
    typeof parsed.body.seed === "string" && parsed.body.seed.trim()
      ? parsed.body.seed.trim()
      : undefined;

  const complete =
    options.complete ??
    (process.env.EVAL_LLM_STUB === "1" ? stubComplete : getJudgeComplete());
  const generate =
    options.generate ??
    (async (job: { context?: string; subject: string }) => {
      if (process.env.EVAL_LLM_STUB === "1") {
        const question = job.context?.trim() || job.subject.trim();
        return `Stub generated answer to: ${question}`;
      }
      return generateJudgedText(job, complete, model);
    });

  try {
    const campaign = await runGoldDatasetCampaign({
      versionId,
      complete,
      generate,
      seed,
      modelId: model,
    });
    return Response.json({
      ok: true,
      campaignId: campaign.campaignId,
      seed: campaign.seed,
      modelId: campaign.modelId,
      datasetVersion: campaign.datasetVersion,
      rubricVersion: campaign.rubricVersion,
      runs: campaign.runs.map((run) => ({
        id: run.id,
        subject: run.subject,
        storedId: run.storedId ?? null,
        result: run.result,
      })),
      table: campaign.table,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign failed";
    const status = /No gold items|versionId is required/i.test(message) ? 400 : 502;
    return jsonError(status, message, status === 400 ? "precheck" : "judge");
  }
}
