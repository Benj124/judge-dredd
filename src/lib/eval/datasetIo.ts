import {
  hashPrompt,
  importGoldItems,
  listGoldItems,
  type DatasetItemRecord,
  type PersistSynthesisResult,
} from "../db/datasetObject";

export type GoldExportRow = {
  id: string;
  context: string;
  reference: string;
  question: string;
  expected_facts: string[];
  source_slug: string;
  prompt_hash: string;
  model: string;
  difficulty?: string;
  created_at: string;
  version_id?: string;
  dataset_id?: string;
};

export function formatFactsAsReference(facts: string[]): string {
  return facts.map((fact) => fact.trim()).filter(Boolean).join("\n");
}

export function parseReferenceAsFacts(reference: string): string[] {
  const trimmed = reference.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // fall through to newline split
    }
  }
  return trimmed
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function goldItemToExportRow(item: DatasetItemRecord): GoldExportRow {
  const question = item.question.trim();
  const facts = item.expectedFacts.map((fact) => fact.trim()).filter(Boolean);
  const row: GoldExportRow = {
    id: item.id,
    context: question,
    reference: formatFactsAsReference(facts),
    question,
    expected_facts: facts,
    source_slug: item.sourceSlug,
    prompt_hash: item.promptHash,
    model: item.model,
    created_at: item.createdAt,
    version_id: item.versionId,
    dataset_id: item.datasetId,
  };
  if (item.difficulty) row.difficulty = item.difficulty;
  return row;
}

export function exportGoldJsonl(items: DatasetItemRecord[]): string {
  const gold = items.filter((item) => item.isGold);
  if (gold.length === 0) {
    throw new Error("No gold items to export");
  }
  return gold.map((item) => JSON.stringify(goldItemToExportRow(item))).join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/**
 * RFC4180 CSV records: commas and newlines inside quoted fields are data.
 * Doubled quotes (`""`) decode to a single `"`.
 */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;

  const flushRecord = () => {
    cells.push(current);
    current = "";
    const nonempty = cells.some((cell) => cell.length > 0);
    if (nonempty) records.push(cells);
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    if (char === "\n") {
      flushRecord();
      continue;
    }
    current += char;
  }
  if (inQuotes || current.length > 0 || cells.length > 0) {
    flushRecord();
  }
  return records;
}

const CSV_HEADERS = [
  "id",
  "context",
  "reference",
  "question",
  "expected_facts",
  "source_slug",
  "prompt_hash",
  "model",
  "difficulty",
  "created_at",
  "version_id",
  "dataset_id",
] as const;

export function exportGoldCsv(items: DatasetItemRecord[]): string {
  const gold = items.filter((item) => item.isGold);
  if (gold.length === 0) {
    throw new Error("No gold items to export");
  }
  const lines = [CSV_HEADERS.join(",")];
  for (const item of gold) {
    const row = goldItemToExportRow(item);
    lines.push(
      [
        row.id,
        row.context,
        row.reference,
        row.question,
        JSON.stringify(row.expected_facts),
        row.source_slug,
        row.prompt_hash,
        row.model,
        row.difficulty ?? "",
        row.created_at,
        row.version_id ?? "",
        row.dataset_id ?? "",
      ]
        .map((cell) => csvEscape(cell))
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const match = Object.keys(record).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (!match) continue;
    const value = record[match];
    if (typeof value === "string") return value;
  }
  return "";
}

function factsFromRecord(record: Record<string, unknown>, reference: string): string[] {
  const raw = record.expected_facts ?? record.expectedFacts;
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return parseReferenceAsFacts(raw);
  }
  return parseReferenceAsFacts(reference);
}

export function parseGoldJsonl(text: string): GoldExportRow[] {
  const rows: GoldExportRow[] = [];
  const lines = text.split(/\r?\n/);
  let index = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid JSONL on line ${index + 1}`);
    }
    if (!isRecord(parsed)) {
      throw new Error(`JSONL row ${index + 1} is not an object`);
    }
    rows.push(recordToExportRow(parsed as Record<string, unknown>, index + 1));
    index += 1;
  }
  if (rows.length === 0) {
    throw new Error("JSONL contained no gold rows");
  }
  return rows;
}

export function parseGoldCsv(text: string): GoldExportRow[] {
  const records = parseCsvRecords(text);
  if (records.length < 2) {
    throw new Error("CSV must include a header and at least one data row");
  }
  const headers = records[0].map((header) => header.trim().toLowerCase());
  const contextIndex = headers.findIndex((header) => header === "context");
  const questionIndex = headers.findIndex((header) => header === "question");
  if (contextIndex < 0 && questionIndex < 0) {
    throw new Error("CSV header must include context or question");
  }
  const factsIndex = headers.findIndex((header) => header === "expected_facts");

  const rows: GoldExportRow[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const cells = records[i];
    const record: Record<string, unknown> = {};
    for (let h = 0; h < headers.length; h += 1) {
      record[headers[h]] = cells[h] ?? "";
    }
    const factsCell = factsIndex >= 0 ? (cells[factsIndex] ?? "") : "";
    if (factsCell.trim()) {
      try {
        record.expected_facts = JSON.parse(factsCell) as unknown;
      } catch {
        record.expected_facts = factsCell;
      }
    }
    rows.push(recordToExportRow(record, i + 1));
  }
  return rows;
}

function recordToExportRow(
  record: Record<string, unknown>,
  line: number,
): GoldExportRow {
  const question = stringField(record, "question", "context").trim();
  const context = stringField(record, "context", "question").trim() || question;
  if (!context) {
    throw new Error(`Row ${line} is missing context/question`);
  }
  const reference = stringField(record, "reference");
  const facts = factsFromRecord(record, reference);
  const resolvedReference = reference.trim() || formatFactsAsReference(facts);
  const sourceSlug = stringField(record, "source_slug", "sourceSlug");
  const promptHash = stringField(record, "prompt_hash", "promptHash");
  const model = stringField(record, "model");
  const id = stringField(record, "id") || `row-${line}`;
  const difficulty = stringField(record, "difficulty").trim() || undefined;
  const createdAt = stringField(record, "created_at", "createdAt") || new Date().toISOString();
  const row: GoldExportRow = {
    id,
    context,
    reference: resolvedReference,
    question: question || context,
    expected_facts: facts,
    source_slug: sourceSlug,
    prompt_hash: promptHash,
    model,
    created_at: createdAt,
  };
  if (difficulty) row.difficulty = difficulty;
  const versionId = stringField(record, "version_id", "versionId");
  const datasetId = stringField(record, "dataset_id", "datasetId");
  if (versionId) row.version_id = versionId;
  if (datasetId) row.dataset_id = datasetId;
  return row;
}

export function parseGoldText(
  text: string,
  format: "jsonl" | "csv",
): GoldExportRow[] {
  if (format === "csv") return parseGoldCsv(text);
  return parseGoldJsonl(text);
}

export async function exportGoldVersion(
  versionId: string,
  format: "jsonl" | "csv",
): Promise<{ body: string; contentType: string; filename: string }> {
  const items = await listGoldItems(versionId);
  if (items.length === 0) {
    throw new Error(`No gold items on version "${versionId}"`);
  }
  if (format === "csv") {
    return {
      body: exportGoldCsv(items),
      contentType: "text/csv; charset=utf-8",
      filename: `dataset-${versionId}.csv`,
    };
  }
  return {
    body: exportGoldJsonl(items),
    contentType: "application/jsonl; charset=utf-8",
    filename: `dataset-${versionId}.jsonl`,
  };
}

export async function importGoldText(options: {
  text: string;
  format: "jsonl" | "csv";
  datasetSlug?: string;
}): Promise<PersistSynthesisResult> {
  const rows = parseGoldText(options.text, options.format);
  const first = rows[0];
  const datasetSlug =
    options.datasetSlug?.trim() || `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return importGoldItems({
    datasetSlug,
    name: `Imported ${options.format}`,
    sourceSlug: first.source_slug || "import",
    promptHash: first.prompt_hash || hashPrompt(options.text.slice(0, 256)),
    model: first.model || "import",
    items: rows.map((row) => ({
      question: row.context || row.question,
      expectedFacts:
        row.expected_facts.length > 0
          ? row.expected_facts
          : parseReferenceAsFacts(row.reference),
      difficulty: row.difficulty,
      sourceSlug: row.source_slug || first.source_slug || "import",
      promptHash: row.prompt_hash || first.prompt_hash || hashPrompt("import"),
      model: row.model || first.model || "import",
      createdAt: row.created_at,
    })),
  });
}
