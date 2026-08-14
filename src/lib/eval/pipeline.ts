import { aggregateOverall, overallPassed } from "./aggregate";
import { precheck, type PrecheckOptions } from "./checks";
import { resolveJudgeModel } from "./models";
import { extractJudgeOutput, parseJudgeJson, scoresById } from "./parse";
import type {
  EvaluateFailure,
  EvaluateResult,
  JudgeComplete,
  RetrievedPassage,
} from "./types";

export type RetrieveFn = (query: string) => Promise<RetrievedPassage[]>;

export type EvaluateOptions = {
  complete: JudgeComplete;
  model?: string;
  resolveRubricId?: PrecheckOptions["resolveRubricId"];
  retrieve?: RetrieveFn;
};

function fail(code: EvaluateFailure["code"], error: string): EvaluateFailure {
  return { ok: false, code, error };
}

export function buildJudgePrompt(job: {
  subject: string;
  context?: string;
  reference?: string;
  retrievedPassages?: RetrievedPassage[];
  rubric: {
    id: string;
    criteria: Array<{
      id: string;
      name: string;
      description: string;
      scale: { min: number; max: number };
    }>;
  };
}): { system: string; user: string } {
  const system =
    "You are an evaluation judge. Score the subject on every criterion. Reply with JSON only: " +
    '{"scores":[{"id":"<criterion id>","score":<number>,"rationale":"<short>"}],"rationale":"<overall>"}. ' +
    "Scores must fall within each criterion scale. Include every criterion id. No markdown. " +
    "For faithfulness/groundedness, score against retrievedPassages when they are present.";

  const payload = {
    rubricId: job.rubric.id,
    criteria: job.rubric.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      description: criterion.description,
      scale: criterion.scale,
    })),
    subject: job.subject,
    context: job.context ?? null,
    reference: job.reference ?? null,
    retrievedPassages: (job.retrievedPassages ?? []).slice(0, 3).map((passage) => ({
      id: passage.id,
      text: passage.text.slice(0, 400),
      score: passage.score,
      source: passage.source ?? null,
    })),
  };

  return { system, user: JSON.stringify(payload) };
}

export async function evaluatePointwise(
  body: unknown,
  options: EvaluateOptions,
): Promise<EvaluateResult> {
  const checked = await precheck(body, {
    resolveRubricId: options.resolveRubricId,
  });
  if ("ok" in checked) {
    return checked;
  }

  const job = checked;
  const resolved = resolveJudgeModel(options.model);
  if (!resolved.ok) {
    return fail("config", resolved.error);
  }

  const useRetrieval =
    Boolean(options.retrieve) &&
    !(
      typeof body === "object" &&
      body !== null &&
      "useRetrieval" in body &&
      (body as { useRetrieval?: unknown }).useRetrieval === false
    );

  let retrievedPassages: RetrievedPassage[] = [];
  if (useRetrieval && options.retrieve) {
    const query = [job.context, job.subject].filter(Boolean).join("\n");
    try {
      retrievedPassages = await options.retrieve(query);
    } catch {
      retrievedPassages = [];
    }
  }

  const { system, user } = buildJudgePrompt({
    ...job,
    retrievedPassages,
  });

  let raw: string;
  try {
    raw = await options.complete({
      system,
      user,
      model: resolved.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Judge call failed";
    const code =
      /XAI_API_KEY|Incorrect xAI API key|Incorrect API key/i.test(message)
        ? "config"
        : "judge";
    return fail(code, message);
  }

  let parsed: unknown;
  try {
    parsed = parseJudgeJson(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid judge JSON";
    return fail("judge", message);
  }

  try {
    const extracted = extractJudgeOutput(parsed);
    const byId = scoresById(extracted.scores, job.rubric);
    const overall = aggregateOverall(job.rubric, byId);
    const passed = overallPassed(job.rubric, byId, overall);
    const scores = job.rubric.criteria.map((criterion) => {
      const match = extracted.scores.find((score) => score.id === criterion.id);
      return {
        id: criterion.id,
        score: byId[criterion.id],
        rationale: match?.rationale,
      };
    });

    return {
      ok: true,
      verdict: {
        rubricId: job.rubric.id,
        rubricVersion: job.rubric.version,
        scores,
        overall,
        passed,
        rationale: extracted.rationale,
        retrievedPassages,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verdict failed checks";
    return fail("postcheck", message);
  }
}
