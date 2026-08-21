import type { Pool } from "pg";
import { getPool } from "../db/pool";
import { contentHash } from "./clean";

export type TextDocumentInput = {
  slug: string;
  title: string;
  canonicalUrl: string;
  fullText: string;
  site?: string;
  httpStatus?: number | null;
  meta?: Record<string, unknown>;
  fetchedAt?: Date;
};

export type TextDocument = {
  id: string;
  slug: string;
  title: string;
  canonicalUrl: string;
  fullText: string;
  contentHash: string;
  site: string;
  fetchedAt: Date;
  httpStatus: number | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type TextDocumentRow = {
  id: string;
  slug: string;
  title: string;
  canonical_url: string;
  full_text: string;
  content_hash: string;
  site: string;
  fetched_at: Date;
  http_status: number | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: TextDocumentRow): TextDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    canonicalUrl: row.canonical_url,
    fullText: row.full_text,
    contentHash: row.content_hash,
    site: row.site,
    fetchedAt: row.fetched_at,
    httpStatus: row.http_status,
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertTextDocument(
  input: TextDocumentInput,
  pool: Pool = getPool(),
): Promise<TextDocument> {
  const fullText = input.fullText.trim();
  if (!fullText) {
    throw new Error(`Refusing to store empty full_text for slug "${input.slug}"`);
  }
  const hash = contentHash(fullText);
  const site = input.site ?? "en.wikipedia.org";
  const meta = input.meta ?? {};
  const fetchedAt = input.fetchedAt ?? new Date();

  const result = await pool.query<TextDocumentRow>(
    `INSERT INTO text_documents (
       slug, title, canonical_url, full_text, content_hash,
       site, fetched_at, http_status, meta, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       canonical_url = EXCLUDED.canonical_url,
       full_text = EXCLUDED.full_text,
       content_hash = EXCLUDED.content_hash,
       site = EXCLUDED.site,
       fetched_at = EXCLUDED.fetched_at,
       http_status = EXCLUDED.http_status,
       meta = EXCLUDED.meta,
       updated_at = now()
     RETURNING *`,
    [
      input.slug,
      input.title.trim(),
      input.canonicalUrl,
      fullText,
      hash,
      site,
      fetchedAt,
      input.httpStatus ?? null,
      JSON.stringify(meta),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function getTextDocumentBySlug(
  slug: string,
  pool: Pool = getPool(),
): Promise<TextDocument | null> {
  const result = await pool.query<TextDocumentRow>(
    `SELECT * FROM text_documents WHERE slug = $1`,
    [slug],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function listTextDocuments(
  options: { site?: string; pool?: Pool } = {},
): Promise<TextDocument[]> {
  const pool = options.pool ?? getPool();
  const result = options.site
    ? await pool.query<TextDocumentRow>(
        `SELECT * FROM text_documents WHERE site = $1 ORDER BY slug`,
        [options.site],
      )
    : await pool.query<TextDocumentRow>(
        `SELECT * FROM text_documents ORDER BY slug`,
      );
  return result.rows.map(mapRow);
}

/** List metadata for UI — no full_text payload. */
export type TextDocumentSummary = {
  id: string;
  slug: string;
  title: string;
  canonicalUrl: string;
  site: string;
  charCount: number;
  contentHash: string;
  fetchedAt: string;
};

type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  canonical_url: string;
  site: string;
  char_count: number | string;
  content_hash: string;
  fetched_at: Date;
};

export async function listTextDocumentSummaries(
  options: { site?: string; pool?: Pool } = {},
): Promise<TextDocumentSummary[]> {
  const pool = options.pool ?? getPool();
  const result = options.site
    ? await pool.query<SummaryRow>(
        `SELECT id::text, slug, title, canonical_url, site,
                length(full_text) AS char_count, content_hash, fetched_at
         FROM text_documents
         WHERE site = $1
         ORDER BY slug`,
        [options.site],
      )
    : await pool.query<SummaryRow>(
        `SELECT id::text, slug, title, canonical_url, site,
                length(full_text) AS char_count, content_hash, fetched_at
         FROM text_documents
         ORDER BY slug`,
      );

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    canonicalUrl: row.canonical_url,
    site: row.site,
    charCount: Number(row.char_count),
    contentHash: row.content_hash,
    fetchedAt:
      row.fetched_at instanceof Date
        ? row.fetched_at.toISOString()
        : String(row.fetched_at),
  }));
}
