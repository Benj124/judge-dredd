import type { Pool } from "pg";
import {
  listTextDocuments,
  type TextDocument,
} from "../graph/store";
import { WHALE_WIKIPEDIA_SEEDS } from "../graph/seeds";
import { getPool } from "../db/pool";
import type { EmbedFn } from "./embed";
import { chunkFullText, type ChunkOptions } from "./chunk";
import { insertChunks, type ChunkInput } from "./retrieve";

/** Primary source id stored on rag_chunks (stable URL). */
export function documentRagSource(doc: Pick<TextDocument, "canonicalUrl">): string {
  return doc.canonicalUrl;
}

/** All source keys to clear on re-ingest (URL + slug for prior layouts). */
export function documentRagSourceKeys(
  doc: Pick<TextDocument, "slug" | "canonicalUrl">,
): string[] {
  return [...new Set([doc.canonicalUrl, doc.slug].filter(Boolean))];
}

export async function deleteChunksBySources(
  sources: string[],
  pool: Pool = getPool(),
): Promise<number> {
  const unique = [...new Set(sources.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  const result = await pool.query(
    `DELETE FROM rag_chunks WHERE source = ANY($1::text[])`,
    [unique],
  );
  return result.rowCount ?? 0;
}

export function documentToChunkInputs(
  doc: TextDocument,
  chunkOptions?: ChunkOptions,
): ChunkInput[] {
  const source = documentRagSource(doc);
  return chunkFullText(doc.fullText, chunkOptions).map((chunk) => ({
    content: chunk.content,
    source,
  }));
}

export type IngestDocumentsResult = {
  documents: number;
  chunks: number;
  deleted: number;
  sources: string[];
  bySlug: Array<{ slug: string; source: string; chunks: number }>;
};

/**
 * Chunk full-text documents, replace prior RAG rows for those sources, embed+insert.
 */
export async function ingestTextDocumentsToRag(options: {
  documents: TextDocument[];
  embed: EmbedFn;
  pool?: Pool;
  chunkOptions?: ChunkOptions;
}): Promise<IngestDocumentsResult> {
  const pool = options.pool ?? getPool();
  const documents = options.documents.filter((doc) => doc.fullText.trim());
  const sourceKeys = documents.flatMap(documentRagSourceKeys);
  const deleted = await deleteChunksBySources(sourceKeys, pool);

  const bySlug: IngestDocumentsResult["bySlug"] = [];
  const allChunks: ChunkInput[] = [];

  for (const doc of documents) {
    const chunks = documentToChunkInputs(doc, options.chunkOptions);
    allChunks.push(...chunks);
    bySlug.push({
      slug: doc.slug,
      source: documentRagSource(doc),
      chunks: chunks.length,
    });
  }

  const ids = await insertChunks(allChunks, options.embed, pool);
  return {
    documents: documents.length,
    chunks: ids.length,
    deleted,
    sources: [...new Set(allChunks.map((c) => c.source).filter(Boolean))] as string[],
    bySlug,
  };
}

export async function loadWhaleTextDocuments(
  pool: Pool = getPool(),
): Promise<TextDocument[]> {
  const slugs = new Set(WHALE_WIKIPEDIA_SEEDS.map((seed) => seed.slug));
  const all = await listTextDocuments({ pool });
  return all.filter((doc) => slugs.has(doc.slug));
}

export async function ingestWhaleDocumentsToRag(options: {
  embed: EmbedFn;
  pool?: Pool;
  chunkOptions?: ChunkOptions;
}): Promise<IngestDocumentsResult> {
  const pool = options.pool ?? getPool();
  const documents = await loadWhaleTextDocuments(pool);
  if (documents.length === 0) {
    throw new Error(
      "No whale text_documents found. Run npm run graph:ingest-whales first.",
    );
  }
  return ingestTextDocumentsToRag({
    documents,
    embed: options.embed,
    pool,
    chunkOptions: options.chunkOptions,
  });
}
