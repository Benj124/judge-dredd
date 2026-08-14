export type BatchJob = {
  id: string;
  subject: string;
  context?: string;
  reference?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const match = Object.keys(record).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (!match) continue;
    const value = record[match];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function parseJsonlJobs(text: string): BatchJob[] {
  const jobs: BatchJob[] = [];
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
    const subject = field(parsed, "subject");
    if (!subject) {
      throw new Error(`JSONL row ${index + 1} is missing subject`);
    }
    const id = field(parsed, "id", "fixtureId", "identity") ?? `row-${index + 1}`;
    const job: BatchJob = { id, subject };
    const context = field(parsed, "context");
    const reference = field(parsed, "reference");
    if (context) job.context = context;
    if (reference) job.reference = reference;
    jobs.push(job);
    index += 1;
  }
  if (jobs.length === 0) {
    throw new Error("JSONL contained no jobs");
  }
  return jobs;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsvJobs(text: string): BatchJob[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row");
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const subjectIndex = headers.findIndex((header) => header === "subject");
  if (subjectIndex < 0) {
    throw new Error("CSV header must include a subject column");
  }
  const idIndex = headers.findIndex((header) =>
    ["id", "fixtureid", "identity"].includes(header),
  );
  const contextIndex = headers.findIndex((header) => header === "context");
  const referenceIndex = headers.findIndex((header) => header === "reference");

  const jobs: BatchJob[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const subject = (cells[subjectIndex] ?? "").trim();
    if (!subject) {
      throw new Error(`CSV row ${i + 1} is missing subject`);
    }
    const id =
      idIndex >= 0 && cells[idIndex]?.trim()
        ? cells[idIndex].trim()
        : `row-${i}`;
    const job: BatchJob = { id, subject };
    if (contextIndex >= 0 && cells[contextIndex]?.trim()) {
      job.context = cells[contextIndex].trim();
    }
    if (referenceIndex >= 0 && cells[referenceIndex]?.trim()) {
      job.reference = cells[referenceIndex].trim();
    }
    jobs.push(job);
  }
  return jobs;
}

export function parseBatchJobs(text: string, format?: "jsonl" | "csv"): BatchJob[] {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Batch text is empty");
  }
  if (format === "csv") return parseCsvJobs(trimmed);
  if (format === "jsonl") return parseJsonlJobs(trimmed);
  if (trimmed.includes("\n") && trimmed.split(/\r?\n/)[0].includes(",") && !trimmed.startsWith("{")) {
    return parseCsvJobs(trimmed);
  }
  return parseJsonlJobs(trimmed);
}
