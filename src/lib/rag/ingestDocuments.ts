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

export async function loadStoredTextDocuments(
  options: { slugs?: string[]; pool?: Pool } = {},
): Promise<TextDocument[]> {
  const pool = options.pool ?? getPool();
  const all = await listTextDocuments({ pool });
  if (!options.slugs?.length) return all;
  const wanted = new Set(options.slugs);
  return all.filter((doc) => wanted.has(doc.slug));
}

export async function ingestStoredDocumentsToRag(options: {
  embed: EmbedFn;
  slugs?: string[];
  pool?: Pool;
  chunkOptions?: ChunkOptions;
}): Promise<IngestDocumentsResult> {
  const pool = options.pool ?? getPool();
  const documents = await loadStoredTextDocuments({
    slugs: options.slugs,
    pool,
  });
  if (documents.length === 0) {
    throw new Error(
      options.slugs?.length
        ? `No text_documents found for slugs: ${options.slugs.join(", ")}`
        : "No text_documents found. Ingest a corpus first (npm run ingest).",
    );
  }
  return ingestTextDocumentsToRag({
    documents,
    embed: options.embed,
    pool,
    chunkOptions: options.chunkOptions,
  });
}

export async function loadWhaleTextDocuments(
  pool: Pool = getPool(),
): Promise<TextDocument[]> {
  const slugs = WHALE_WIKIPEDIA_SEEDS.map((seed) => seed.slug);
  return loadStoredTextDocuments({ slugs, pool });
}

/** Demo wrapper: whale seeds through generic documents → chunks. */
export async function ingestWhaleDocumentsToRag(options: {
  embed: EmbedFn;
  pool?: Pool;
  chunkOptions?: ChunkOptions;
}): Promise<IngestDocumentsResult> {
  const slugs = WHALE_WIKIPEDIA_SEEDS.map((seed) => seed.slug);
  try {
    return await ingestStoredDocumentsToRag({
      embed: options.embed,
      slugs,
      pool: options.pool,
      chunkOptions: options.chunkOptions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/No text_documents found/i.test(message)) {
      throw new Error(
        "No whale text_documents found. Run npm run graph:ingest-whales first.",
      );
    }
    throw error;
  }
}
