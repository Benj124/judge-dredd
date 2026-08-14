import type { Pool } from "pg";
import { DEFAULT_JUDGE_MODEL } from "../eval/models";
import { parseRubric } from "../eval/parseRubric";
import type { CriterionScore, Rubric, Verdict } from "../eval/types";
import { getPool } from "./pool";

export type EvaluateRunInput = {
  subject: string;
  context?: string | null;
  reference?: string | null;
  campaignId?: string | null;
  fixtureId?: string | null;
  verdict: Verdict;
};

export type StoredEvaluateRun = {
  id: string;
  createdAt: string;
  subject: string;
  context: string | null;
  reference: string | null;
  campaignId: string | null;
  fixtureId: string | null;
  rubricId: string;
  rubricVersion: string;
  verdict: Verdict;
};

export type AgenticOptions = {
  judgeModel: string;
  updatedAt?: string;
};

export const DEFAULT_AGENTIC_OPTIONS: AgenticOptions = {
  judgeModel: DEFAULT_JUDGE_MODEL,
};

type RunRow = {
  id: string;
  created_at: Date;
  subject: string;
  context: string | null;
  reference: string | null;
  campaign_id: string | null;
  fixture_id: string | null;
  rubric_id: string;
  rubric_version: string;
  scores: CriterionScore[];
  overall: string | number;
  passed: boolean | null;
  rationale: string;
};

type RubricRow = {
  id: string;
  version: string;
  name: string;
  description: string;
  body: unknown;
  created_at: Date;
  updated_at: Date;
};

type OptionsRow = {
  id: string;
  judge_model: string;
  body: unknown;
  updated_at: Date;
};

function toStored(row: RunRow): StoredEvaluateRun {
  const overall =
    typeof row.overall === "number" ? row.overall : Number(row.overall);
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    subject: row.subject,
    context: row.context,
    reference: row.reference,
    campaignId: row.campaign_id,
    fixtureId: row.fixture_id,
    rubricId: row.rubric_id,
    rubricVersion: row.rubric_version,
    verdict: {
      rubricId: row.rubric_id,
      rubricVersion: row.rubric_version,
      scores: row.scores,
      overall,
      passed: row.passed,
      rationale: row.rationale,
    },
  };
}

function rowToRubric(row: RubricRow): Rubric {
  const parsed = parseRubric(row.body);
  if (!parsed) {
    throw new Error(`Stored rubric "${row.id}" has invalid body`);
  }
  return parsed;
}

export async function saveEvaluateRun(
  input: EvaluateRunInput,
  pool: Pool = getPool(),
): Promise<StoredEvaluateRun> {
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("subject is required");
  }
  const { verdict } = input;
  const result = await pool.query<RunRow>(
    `INSERT INTO evaluate_runs (
       subject, context, reference, campaign_id, fixture_id,
       rubric_id, rubric_version, scores, overall, passed, rationale
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     RETURNING id, created_at, subject, context, reference,
               campaign_id, fixture_id, rubric_id, rubric_version,
               scores, overall, passed, rationale`,
    [
      subject,
      input.context ?? null,
      input.reference ?? null,
      input.campaignId ?? null,
      input.fixtureId ?? null,
      verdict.rubricId,
      verdict.rubricVersion,
      JSON.stringify(verdict.scores),
      verdict.overall,
      verdict.passed,
      verdict.rationale,
    ],
  );
  return toStored(result.rows[0]);
}

export async function getEvaluateRun(
  id: string,
  pool: Pool = getPool(),
): Promise<StoredEvaluateRun | null> {
  const result = await pool.query<RunRow>(
    `SELECT id, created_at, subject, context, reference,
            campaign_id, fixture_id, rubric_id, rubric_version,
            scores, overall, passed, rationale
     FROM evaluate_runs
     WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  return toStored(result.rows[0]);
}

export type EvaluateRunFilters = {
  rubricId?: string;
  passed?: boolean;
  from?: Date;
  to?: Date;
};

export function parseRunFilters(input: {
  rubricId?: string | null;
  passed?: string | null;
  from?: string | null;
  to?: string | null;
}): EvaluateRunFilters {
  const filters: EvaluateRunFilters = {};
  const rubricId = input.rubricId?.trim();
  if (rubricId) filters.rubricId = rubricId;

  const passedRaw = input.passed?.trim().toLowerCase();
  if (passedRaw === "true" || passedRaw === "pass") filters.passed = true;
  if (passedRaw === "false" || passedRaw === "fail") filters.passed = false;

  if (input.from?.trim()) {
    const from = parseFilterDate(input.from.trim(), "start");
    if (from) filters.from = from;
  }
  if (input.to?.trim()) {
    const to = parseFilterDate(input.to.trim(), "end");
    if (to) filters.to = to;
  }
  return filters;
}

function parseFilterDate(value: string, bound: "start" | "end"): Date | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(
      bound === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`,
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export async function listEvaluateRuns(
  filters: EvaluateRunFilters = {},
  pool: Pool = getPool(),
): Promise<StoredEvaluateRun[]> {
  const result = await pool.query<RunRow>(
    `SELECT id, created_at, subject, context, reference,
            campaign_id, fixture_id, rubric_id, rubric_version,
            scores, overall, passed, rationale
     FROM evaluate_runs
     WHERE ($1::text IS NULL OR rubric_id = $1)
       AND ($2::boolean IS NULL OR passed IS NOT DISTINCT FROM $2)
       AND ($3::timestamptz IS NULL OR created_at >= $3)
       AND ($4::timestamptz IS NULL OR created_at <= $4)
     ORDER BY created_at DESC
     LIMIT 200`,
    [
      filters.rubricId ?? null,
      filters.passed ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return result.rows.map(toStored);
}

export async function listCampaignEvaluateRuns(
  campaignId: string,
  pool: Pool = getPool(),
): Promise<StoredEvaluateRun[]> {
  const result = await pool.query<RunRow>(
    `SELECT id, created_at, subject, context, reference,
            campaign_id, fixture_id, rubric_id, rubric_version,
            scores, overall, passed, rationale
     FROM evaluate_runs
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId],
  );
  return result.rows.map(toStored);
}

export async function saveStoredRubric(
  rubric: Rubric,
  pool: Pool = getPool(),
): Promise<Rubric> {
  const parsed = parseRubric(rubric);
  if (!parsed) {
    throw new Error("rubric is invalid");
  }
  if (parsed.id === "default") {
    throw new Error('Cannot overwrite built-in rubric id "default"');
  }

  await pool.query(
    `INSERT INTO stored_rubrics (id, version, name, description, body, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       version = EXCLUDED.version,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       body = EXCLUDED.body,
       updated_at = now()`,
    [
      parsed.id,
      parsed.version,
      parsed.name,
      parsed.description,
      JSON.stringify(parsed),
    ],
  );
  return parsed;
}

export async function getStoredRubric(
  id: string,
  pool: Pool = getPool(),
): Promise<Rubric | null> {
  const result = await pool.query<RubricRow>(
    `SELECT id, version, name, description, body, created_at, updated_at
     FROM stored_rubrics
     WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  return rowToRubric(result.rows[0]);
}

export async function listStoredRubrics(
  pool: Pool = getPool(),
): Promise<Rubric[]> {
  const result = await pool.query<RubricRow>(
    `SELECT id, version, name, description, body, created_at, updated_at
     FROM stored_rubrics
     ORDER BY updated_at DESC`,
  );
  return result.rows.map(rowToRubric);
}

export async function deleteStoredRubric(
  id: string,
  pool: Pool = getPool(),
): Promise<boolean> {
  if (id === "default") {
    throw new Error('Cannot delete built-in rubric id "default"');
  }
  const result = await pool.query(`DELETE FROM stored_rubrics WHERE id = $1`, [
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Id prefixes left behind by automated tests / UI verify scripts.
 * Used to purge junk rows without deleting legitimate user prompts.
 */
export const STORED_RUBRIC_TEST_ID_PREFIXES = [
  "http-rubric-",
  "store-rubric-",
  "store-then-eval-",
  "ui-persist-",
  "ui-rubric-",
  "verify-rubric-",
] as const;

export function isStoredRubricTestPollutionId(id: string): boolean {
  return STORED_RUBRIC_TEST_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** Delete every stored rubric whose id starts with one of the given prefixes. */
export async function deleteStoredRubricsByIdPrefixes(
  prefixes: readonly string[],
  pool: Pool = getPool(),
): Promise<string[]> {
  const cleaned = prefixes.map((prefix) => prefix.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const result = await pool.query<{ id: string }>(
    `DELETE FROM stored_rubrics
     WHERE id <> 'default'
       AND (${cleaned.map((_, i) => `id LIKE $${i + 1}`).join(" OR ")})
     RETURNING id`,
    cleaned.map((prefix) => `${prefix}%`),
  );
  return result.rows.map((row) => row.id);
}

/** One-shot purge of known test-pollution evaluation-prompt rows. */
export async function purgeStoredRubricTestPollution(
  pool: Pool = getPool(),
): Promise<string[]> {
  return deleteStoredRubricsByIdPrefixes(STORED_RUBRIC_TEST_ID_PREFIXES, pool);
}

export function normalizeAgenticOptions(input: unknown): AgenticOptions {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_AGENTIC_OPTIONS };
  }
  const record = input as Record<string, unknown>;
  const rawModel =
    typeof record.judgeModel === "string"
      ? record.judgeModel
      : typeof record.judge_model === "string"
        ? record.judge_model
        : DEFAULT_JUDGE_MODEL;
  const judgeModel = rawModel.trim() || DEFAULT_JUDGE_MODEL;
  return { judgeModel };
}

export async function getAgenticOptions(
  pool: Pool = getPool(),
): Promise<AgenticOptions> {
  const result = await pool.query<OptionsRow>(
    `SELECT id, judge_model, body, updated_at
     FROM agentic_options
     WHERE id = 'default'`,
  );
  if (result.rows.length === 0) {
    return { ...DEFAULT_AGENTIC_OPTIONS };
  }
  const row = result.rows[0];
  return {
    judgeModel: row.judge_model.trim() || DEFAULT_JUDGE_MODEL,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function saveAgenticOptions(
  input: unknown,
  pool: Pool = getPool(),
): Promise<AgenticOptions> {
  const normalized = normalizeAgenticOptions(input);
  const result = await pool.query<OptionsRow>(
    `INSERT INTO agentic_options (id, judge_model, body, updated_at)
     VALUES ('default', $1, '{}'::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       judge_model = EXCLUDED.judge_model,
       updated_at = now()
     RETURNING id, judge_model, body, updated_at`,
    [normalized.judgeModel],
  );
  const row = result.rows[0];
  return {
    judgeModel: row.judge_model,
    updatedAt: row.updated_at.toISOString(),
  };
}
