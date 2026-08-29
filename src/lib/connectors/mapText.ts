import { slugify } from "../graph/slug";
import type { MappedCorpusDoc } from "./types";

const TITLE_KEYS = ["title", "name", "heading", "headline", "article_title"];
const BODY_KEYS = [
  "body",
  "text",
  "content",
  "article",
  "html",
  "description",
  "full_text",
  "fullText",
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function firstString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function parseJsonData(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === "string" && raw.trim()) {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }
  return asRecord(raw);
}

function decodeRawBytes(rawBytes: unknown): string {
  if (typeof rawBytes !== "string" || !rawBytes.trim()) return "";
  try {
    return Buffer.from(rawBytes, "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

export function mapDiscoveryEngineDocument(doc: unknown): MappedCorpusDoc | null {
  const record = asRecord(doc);
  if (!record) return null;
  const structData = asRecord(record.structData);
  const jsonData = parseJsonData(record.jsonData);
  const content = asRecord(record.content);
  const derived = asRecord(record.derivedStructData);

  const title =
    firstString(structData, TITLE_KEYS) ||
    firstString(jsonData, TITLE_KEYS) ||
    firstString(derived, TITLE_KEYS) ||
    (typeof record.id === "string" ? record.id : undefined) ||
    "untitled";

  let body =
    firstString(structData, BODY_KEYS) ||
    firstString(jsonData, BODY_KEYS) ||
    firstString(derived, BODY_KEYS) ||
    "";
  if (!body && content) {
    body =
      decodeRawBytes(content.rawBytes) ||
      (typeof content.html === "string" ? content.html.trim() : "") ||
      (typeof content.uri === "string" ? "" : "");
  }
  if (!body && structData) {
    const leftover = { ...structData };
    for (const key of TITLE_KEYS) delete leftover[key];
    const joined = Object.values(leftover)
      .map(stringifyUnknown)
      .filter(Boolean)
      .join("\n");
    body = joined;
  }
  if (!body.trim()) return null;

  const id =
    (typeof record.id === "string" && record.id.trim()) ||
    (typeof record.name === "string"
      ? record.name.split("/").filter(Boolean).pop() || ""
      : "") ||
    slugify(title);
  const uri =
    (content && typeof content.uri === "string" && content.uri.trim()) ||
    (typeof record.name === "string" && record.name.trim()
      ? `https://discoveryengine.googleapis.com/v1/${record.name}`
      : `gcp-datastore://${id}`);

  return {
    title: title.trim(),
    body: body.trim(),
    slug: slugify(id),
    canonicalUrl: uri,
    sourceId: id,
  };
}

export function mapDiscoveryEngineList(payload: unknown): MappedCorpusDoc[] {
  const record = asRecord(payload);
  const documents = Array.isArray(record?.documents) ? record.documents : [];
  const mapped: MappedCorpusDoc[] = [];
  for (const doc of documents) {
    const item = mapDiscoveryEngineDocument(doc);
    if (item) mapped.push(item);
  }
  return mapped;
}

type DatabricksColumn = { name?: string };

function columnNames(payload: Record<string, unknown>): string[] {
  const manifest = asRecord(payload.manifest);
  const columns = Array.isArray(manifest?.columns)
    ? (manifest.columns as DatabricksColumn[])
    : [];
  return columns
    .map((col) => (typeof col.name === "string" ? col.name : ""))
    .filter(Boolean);
}

function rowToRecord(
  row: unknown,
  names: string[],
): Record<string, unknown> | undefined {
  if (Array.isArray(row)) {
    const out: Record<string, unknown> = {};
    row.forEach((value, index) => {
      const name = names[index] || `col_${index}`;
      out[name] = value;
    });
    return out;
  }
  return asRecord(row);
}

export function mapDatabricksQueryResult(
  payload: unknown,
  options: { textColumn?: string; titleColumn?: string } = {},
): MappedCorpusDoc[] {
  const record = asRecord(payload);
  if (!record) return [];
  const result = asRecord(record.result) ?? record;
  const names = columnNames(record);
  const rows = Array.isArray(result.data_array)
    ? result.data_array
    : Array.isArray(result.data)
      ? result.data
      : [];
  const textKeys = options.textColumn
    ? [options.textColumn, ...BODY_KEYS]
    : BODY_KEYS;
  const titleKeys = options.titleColumn
    ? [options.titleColumn, ...TITLE_KEYS]
    : TITLE_KEYS;

  const mapped: MappedCorpusDoc[] = [];
  for (const row of rows) {
    const obj = rowToRecord(row, names);
    if (!obj) continue;
    const title =
      firstString(obj, titleKeys) ||
      firstString(obj, ["id"]) ||
      "untitled";
    const body = firstString(obj, textKeys) || "";
    if (!body.trim()) continue;
    const id =
      firstString(obj, ["id", "pk", "row_id"]) || slugify(title);
    const url =
      firstString(obj, ["url", "uri", "canonical_url"]) ||
      `databricks-index://${id}`;
    mapped.push({
      title,
      body,
      slug: slugify(id),
      canonicalUrl: url,
      sourceId: id,
    });
  }
  return mapped;
}
