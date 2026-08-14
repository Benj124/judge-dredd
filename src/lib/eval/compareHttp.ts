import { getEvaluateRun } from "../db/store";
import { compareEvaluateRuns } from "./compare";

export async function compareRunsHttp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const aId = url.searchParams.get("a")?.trim();
  const bId = url.searchParams.get("b")?.trim();
  if (!aId || !bId) {
    return Response.json(
      { ok: false, error: "query params a and b (run ids) are required", code: "precheck" },
      { status: 400 },
    );
  }
  try {
    const [a, b] = await Promise.all([getEvaluateRun(aId), getEvaluateRun(bId)]);
    if (!a || !b) {
      return Response.json(
        { ok: false, error: "one or both runs were not found", code: "precheck" },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, compare: compareEvaluateRuns(a, b) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compare failed";
    return Response.json(
      { ok: false, error: message, code: "config" },
      { status: 503 },
    );
  }
}
