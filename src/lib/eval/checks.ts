import { parseRubric } from "./parseRubric";
import { getRubric } from "./rubrics";
import type { EvaluateFailure, EvaluateJob, Rubric } from "./types";

export { parseRubric } from "./parseRubric";

function fail(error: string): EvaluateFailure {
  return { ok: false, error, code: "precheck" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type PrecheckOptions = {
  /** When set, used for rubricId lookup after built-ins (e.g. DB-backed rubrics). */
  resolveRubricId?: (id: string) => Promise<Rubric | undefined> | Rubric | undefined;
};

export async function precheck(
  body: unknown,
  options: PrecheckOptions = {},
): Promise<EvaluateJob | EvaluateFailure> {
  if (!isRecord(body)) {
    return fail("Request body must be a JSON object");
  }

  if (typeof body.subject !== "string" || !body.subject.trim()) {
    return fail("subject is required");
  }

  const context =
    typeof body.context === "string" && body.context.trim()
      ? body.context
      : undefined;
  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference
      : undefined;

  let rubric: Rubric | undefined;
  if (body.rubric !== undefined) {
    rubric = parseRubric(body.rubric) ?? undefined;
    if (!rubric) {
      return fail("rubric is invalid");
    }
  } else if (typeof body.rubricId === "string" && body.rubricId.trim()) {
    const id = body.rubricId.trim();
    rubric = getRubric(id);
    if (!rubric && options.resolveRubricId) {
      rubric = await options.resolveRubricId(id);
    }
    if (!rubric) {
      return fail(`Unknown rubricId "${body.rubricId}"`);
    }
  } else {
    rubric = getRubric("default");
  }

  if (!rubric) {
    return fail("No rubric available");
  }

  return {
    subject: body.subject.trim(),
    context,
    reference,
    rubric,
  };
}
