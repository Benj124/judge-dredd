import { getEvaluateRun, listEvaluateRuns, parseRunFilters } from "./store";

function publicRun(run: Awaited<ReturnType<typeof getEvaluateRun>>) {
  if (!run) return null;
  return {
    id: run.id,
    createdAt: run.createdAt,
    subject: run.subject,
    context: run.context,
    reference: run.reference,
    campaignId: run.campaignId,
    fixtureId: run.fixtureId,
    rubricId: run.rubricId,
    rubricVersion: run.rubricVersion,
    verdict: run.verdict,
  };
}

export async function listRunsHttp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const filters = parseRunFilters({
    rubricId: url.searchParams.get("rubricId"),
    passed: url.searchParams.get("passed"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  try {
    const runs = await listEvaluateRuns(filters);
    return Response.json({
      ok: true,
      runs: runs.map((run) => publicRun(run)),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list evaluate runs";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}

export async function getRunHttp(
  id: string | undefined,
): Promise<Response> {
  if (!id?.trim()) {
    return Response.json(
      { ok: false, error: "run id is required", code: "precheck" },
      { status: 400 },
    );
  }
  try {
    const run = await getEvaluateRun(id.trim());
    if (!run) {
      return Response.json(
        { ok: false, error: "run not found", code: "precheck" },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, run: publicRun(run) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load evaluate run";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}
