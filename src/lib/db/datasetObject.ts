import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

export type ReviewStatus = "pending" | "kept" | "edited" | "rejected";
export type ReviewAction = "keep" | "edit" | "reject";

export type DatasetRecord = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
};

export type DatasetVersionRecord = {
  id: string;
  datasetId: string;
  version: number;
  sourceSlug: string;
  promptHash: string;
  prompt: string;
  model: string;
  createdAt: string;
};

export type DatasetItemRecord = {
  id: string;
  datasetId: string;
  versionId: string;
  ordinal: number;
  question: string;
  expectedFacts: string[];
  difficulty?: string;
  sourceSlug: string;
  promptHash: string;
  model: string;
  reviewStatus: ReviewStatus;
  isGold: boolean;
  createdAt: string;
  reviewedAt: string | null;
};

export type PersistSynthesisInput = {
  sourceSlug: string;
  prompt: string;
  model: string;
  questions: Array<{
    question: string;
    expected_facts: string[];
    difficulty?: string;
  }>;
  name?: string;
};

export type PersistSynthesisResult = {
  dataset: DatasetRecord;
  version: DatasetVersionRecord;
  items: DatasetItemRecord[];
};

const REVIEW_STATUSES = new Set<ReviewStatus>([
  "pending",
  "kept",
  "edited",
  "rejected",
]);

type DatasetRow = {
  id: string;
  slug: string;
  name: string;
  created_at: Date;
};

type VersionRow = {
  id: string;
  dataset_id: string;
  version: number;
  source_slug: string;
  prompt_hash: string;
  prompt: string;
  model: string;
  created_at: Date;
};

type ItemRow = {
  id: string;
  dataset_id: string;
  version_id: string;
  ordinal: number;
  question: string;
  expected_facts: unknown;
  difficulty: string | null;
  source_slug: string;
  prompt_hash: string;
  model: string;
  review_status: string;
  is_gold: boolean;
  created_at: Date;
  reviewed_at: Date | null;
};

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

function parseFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseReviewStatus(value: string): ReviewStatus {
  if (REVIEW_STATUSES.has(value as ReviewStatus)) {
    return value as ReviewStatus;
  }
  return "pending";
}

function mapDataset(row: DatasetRow): DatasetRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

function mapVersion(row: VersionRow): DatasetVersionRecord {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    version: row.version,
    sourceSlug: row.source_slug,
    promptHash: row.prompt_hash,
    prompt: row.prompt,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}

function mapItem(row: ItemRow): DatasetItemRecord {
  const difficulty =
    typeof row.difficulty === "string" && row.difficulty.trim()
      ? row.difficulty.trim()
      : undefined;
  return {
    id: row.id,
    datasetId: row.dataset_id,
    versionId: row.version_id,
    ordinal: row.ordinal,
    question: row.question,
    expectedFacts: parseFacts(row.expected_facts),
    difficulty,
    sourceSlug: row.source_slug,
    promptHash: row.prompt_hash,
    model: row.model,
    reviewStatus: parseReviewStatus(row.review_status),
    isGold: row.is_gold,
    createdAt: row.created_at.toISOString(),
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
  };
}

function datasetSlugForSource(sourceSlug: string): string {
  return `synth-${sourceSlug}`;
}

async function upsertDataset(
  client: PoolClient,
  slug: string,
  name: string,
): Promise<DatasetRecord> {
  const result = await client.query<DatasetRow>(
    `INSERT INTO datasets (slug, name)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = datasets.name
     RETURNING id, slug, name, created_at`,
    [slug, name],
  );
  return mapDataset(result.rows[0]);
}

/**
 * Persist raw synthesis JSON as a new dataset version. Items are pending and not gold.
 */
export async function persistSynthesisVersion(
  input: PersistSynthesisInput,
  pool: Pool = getPool(),
): Promise<PersistSynthesisResult> {
  const sourceSlug = input.sourceSlug.trim();
  if (!sourceSlug) {
    throw new Error("sourceSlug is required");
  }
  const prompt = input.prompt;
  if (!prompt.trim()) {
    throw new Error("prompt is required");
  }
  const model = input.model.trim();
  if (!model) {
    throw new Error("model is required");
  }
  if (!input.questions.length) {
    throw new Error("questions must be a non-empty array");
  }

  const promptHash = hashPrompt(prompt);
  const name = input.name?.trim() || `Synthesis: ${sourceSlug}`;
  const slug = datasetSlugForSource(sourceSlug);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dataset = await upsertDataset(client, slug, name);
    const versionNo = await client.query<{ next: string | number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next
       FROM dataset_versions
       WHERE dataset_id = $1`,
      [dataset.id],
    );
    const nextVersion = Number(versionNo.rows[0].next);
    const versionResult = await client.query<VersionRow>(
      `INSERT INTO dataset_versions (
         dataset_id, version, source_slug, prompt_hash, prompt, model
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, dataset_id, version, source_slug, prompt_hash, prompt, model, created_at`,
      [dataset.id, nextVersion, sourceSlug, promptHash, prompt, model],
    );
    const version = mapVersion(versionResult.rows[0]);

    const items: DatasetItemRecord[] = [];
    for (let index = 0; index < input.questions.length; index += 1) {
      const question = input.questions[index];
      const text = question.question.trim();
      if (!text) {
        throw new Error(`Question at index ${index} is empty`);
      }
      const facts = question.expected_facts
        .map((fact) => fact.trim())
        .filter(Boolean);
      const difficulty = question.difficulty?.trim() || null;
      const inserted = await client.query<ItemRow>(
        `INSERT INTO dataset_items (
           dataset_id, version_id, ordinal, question, expected_facts, difficulty,
           source_slug, prompt_hash, model, review_status, is_gold
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 'pending', false)
         RETURNING id, dataset_id, version_id, ordinal, question, expected_facts,
                   difficulty, source_slug, prompt_hash, model, review_status,
                   is_gold, created_at, reviewed_at`,
        [
          dataset.id,
          version.id,
          index,
          text,
          JSON.stringify(facts),
          difficulty,
          sourceSlug,
          promptHash,
          model,
        ],
      );
      items.push(mapItem(inserted.rows[0]));
    }

    await client.query("COMMIT");
    return { dataset, version, items };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDatasetVersion(
  versionId: string,
  pool: Pool = getPool(),
): Promise<DatasetVersionRecord | null> {
  const result = await pool.query<VersionRow>(
    `SELECT id, dataset_id, version, source_slug, prompt_hash, prompt, model, created_at
     FROM dataset_versions
     WHERE id = $1`,
    [versionId],
  );
  if (result.rows.length === 0) return null;
  return mapVersion(result.rows[0]);
}

export async function listVersionItems(
  versionId: string,
  pool: Pool = getPool(),
): Promise<DatasetItemRecord[]> {
  const result = await pool.query<ItemRow>(
    `SELECT id, dataset_id, version_id, ordinal, question, expected_facts,
            difficulty, source_slug, prompt_hash, model, review_status,
            is_gold, created_at, reviewed_at
     FROM dataset_items
     WHERE version_id = $1
     ORDER BY ordinal ASC`,
    [versionId],
  );
  return result.rows.map(mapItem);
}

export async function listGoldItems(
  versionId: string,
  pool: Pool = getPool(),
): Promise<DatasetItemRecord[]> {
  const result = await pool.query<ItemRow>(
    `SELECT id, dataset_id, version_id, ordinal, question, expected_facts,
            difficulty, source_slug, prompt_hash, model, review_status,
            is_gold, created_at, reviewed_at
     FROM dataset_items
     WHERE version_id = $1
       AND is_gold = true
       AND review_status IN ('kept', 'edited')
     ORDER BY ordinal ASC`,
    [versionId],
  );
  return result.rows.map(mapItem);
}

export async function getDatasetItem(
  itemId: string,
  pool: Pool = getPool(),
): Promise<DatasetItemRecord | null> {
  const result = await pool.query<ItemRow>(
    `SELECT id, dataset_id, version_id, ordinal, question, expected_facts,
            difficulty, source_slug, prompt_hash, model, review_status,
            is_gold, created_at, reviewed_at
     FROM dataset_items
     WHERE id = $1`,
    [itemId],
  );
  if (result.rows.length === 0) return null;
  return mapItem(result.rows[0]);
}

export async function reviewDatasetItem(
  options: {
    itemId: string;
    action: ReviewAction;
    question?: string;
    expectedFacts?: string[];
  },
  pool: Pool = getPool(),
): Promise<DatasetItemRecord> {
  const itemId = options.itemId.trim();
  if (!itemId) {
    throw new Error("itemId is required");
  }
  const existing = await getDatasetItem(itemId, pool);
  if (!existing) {
    throw new Error(`No dataset item found for id "${itemId}"`);
  }

  if (options.action === "reject") {
    const result = await pool.query<ItemRow>(
      `UPDATE dataset_items
       SET review_status = 'rejected', is_gold = false, reviewed_at = now()
       WHERE id = $1
       RETURNING id, dataset_id, version_id, ordinal, question, expected_facts,
                 difficulty, source_slug, prompt_hash, model, review_status,
                 is_gold, created_at, reviewed_at`,
      [itemId],
    );
    return mapItem(result.rows[0]);
  }

  if (options.action === "keep") {
    const result = await pool.query<ItemRow>(
      `UPDATE dataset_items
       SET review_status = 'kept', is_gold = true, reviewed_at = now()
       WHERE id = $1
       RETURNING id, dataset_id, version_id, ordinal, question, expected_facts,
                 difficulty, source_slug, prompt_hash, model, review_status,
                 is_gold, created_at, reviewed_at`,
      [itemId],
    );
    return mapItem(result.rows[0]);
  }

  const question = (options.question ?? existing.question).trim();
  if (!question) {
    throw new Error("Edited question text is required");
  }
  const expectedFacts = (
    options.expectedFacts ?? existing.expectedFacts
  )
    .map((fact) => fact.trim())
    .filter(Boolean);

  const result = await pool.query<ItemRow>(
    `UPDATE dataset_items
     SET question = $2,
         expected_facts = $3::jsonb,
         review_status = 'edited',
         is_gold = true,
         reviewed_at = now()
     WHERE id = $1
     RETURNING id, dataset_id, version_id, ordinal, question, expected_facts,
               difficulty, source_slug, prompt_hash, model, review_status,
               is_gold, created_at, reviewed_at`,
    [itemId, question, JSON.stringify(expectedFacts)],
  );
  return mapItem(result.rows[0]);
}

export type ImportGoldItemInput = {
  question: string;
  expectedFacts: string[];
  difficulty?: string;
  sourceSlug: string;
  promptHash: string;
  model: string;
  createdAt?: string;
};

/**
 * Import already-gold rows as a new dataset version. Items are kept gold.
 */
export async function importGoldItems(
  input: {
    datasetSlug: string;
    name?: string;
    sourceSlug: string;
    promptHash: string;
    prompt?: string;
    model: string;
    items: ImportGoldItemInput[];
  },
  pool: Pool = getPool(),
): Promise<PersistSynthesisResult> {
  const datasetSlug = input.datasetSlug.trim();
  if (!datasetSlug) {
    throw new Error("datasetSlug is required");
  }
  if (!input.items.length) {
    throw new Error("items must be a non-empty array");
  }
  const sourceSlug = input.sourceSlug.trim() || "import";
  const promptHash = input.promptHash.trim() || hashPrompt("import");
  const model = input.model.trim() || "import";
  const prompt = input.prompt ?? "";
  const name = input.name?.trim() || `Import: ${datasetSlug}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dataset = await upsertDataset(client, datasetSlug, name);
    const versionNo = await client.query<{ next: string | number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next
       FROM dataset_versions
       WHERE dataset_id = $1`,
      [dataset.id],
    );
    const nextVersion = Number(versionNo.rows[0].next);
    const versionResult = await client.query<VersionRow>(
      `INSERT INTO dataset_versions (
         dataset_id, version, source_slug, prompt_hash, prompt, model
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, dataset_id, version, source_slug, prompt_hash, prompt, model, created_at`,
      [dataset.id, nextVersion, sourceSlug, promptHash, prompt, model],
    );
    const version = mapVersion(versionResult.rows[0]);

    const items: DatasetItemRecord[] = [];
    for (let index = 0; index < input.items.length; index += 1) {
      const row = input.items[index];
      const question = row.question.trim();
      if (!question) {
        throw new Error(`Imported item at index ${index} is missing question`);
      }
      const facts = row.expectedFacts.map((fact) => fact.trim()).filter(Boolean);
      const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
      const inserted = await client.query<ItemRow>(
        `INSERT INTO dataset_items (
           dataset_id, version_id, ordinal, question, expected_facts, difficulty,
           source_slug, prompt_hash, model, review_status, is_gold, created_at, reviewed_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 'kept', true, $10, now())
         RETURNING id, dataset_id, version_id, ordinal, question, expected_facts,
                   difficulty, source_slug, prompt_hash, model, review_status,
                   is_gold, created_at, reviewed_at`,
        [
          dataset.id,
          version.id,
          index,
          question,
          JSON.stringify(facts),
          row.difficulty?.trim() || null,
          row.sourceSlug.trim() || sourceSlug,
          row.promptHash.trim() || promptHash,
          row.model.trim() || model,
          createdAt,
        ],
      );
      items.push(mapItem(inserted.rows[0]));
    }

    await client.query("COMMIT");
    return { dataset, version, items };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function publicDatasetItem(item: DatasetItemRecord) {
  return {
    id: item.id,
    datasetId: item.datasetId,
    versionId: item.versionId,
    ordinal: item.ordinal,
    question: item.question,
    expected_facts: item.expectedFacts,
    difficulty: item.difficulty ?? null,
    source_slug: item.sourceSlug,
    prompt_hash: item.promptHash,
    model: item.model,
    review_status: item.reviewStatus,
    is_gold: item.isGold,
    created_at: item.createdAt,
    reviewed_at: item.reviewedAt,
  };
}
