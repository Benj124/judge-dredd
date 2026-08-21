import type { Pool } from "pg";
import { getPool } from "../db/pool";
import type { EmbedFn } from "./embed";
import { formatVectorLiteral } from "./embed";
import { reciprocalRankFuse } from "./fuse";

export type Passage = {
  id: string;
  text: string;
  score: number;
  source: string | null;
};

export type ChunkInput = {
  content: string;
  source?: string | null;
};

type HitRow = { id: string; content: string; source: string | null; score: number };

export async function insertChunks(
  chunks: ChunkInput[],
  embed: EmbedFn,
  pool: Pool = getPool(),
): Promise<string[]> {
  const ids: string[] = [];
  for (const chunk of chunks) {
    const content = chunk.content.trim();
    if (!content) continue;
    const vector = await embed(content);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO rag_chunks (source, content, embedding)
       VALUES ($1, $2, $3::vector)
       RETURNING id`,
      [chunk.source ?? null, content, formatVectorLiteral(vector)],
    );
    ids.push(result.rows[0].id);
  }
  return ids;
}

/**
 * Build an OR-joined english tsquery from query text.
 * plainto_tsquery ANDs every token, so natural-language framing
 * ("Is this claim grounded…") zeros out hits even when distinctive
 * terms like "zinnium" are present. OR keeps lexical recall usable.
 */
export function buildLexicalTsQuery(text: string): string {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  const unique = [...new Set(tokens)];
  if (unique.length === 0) return "";
  // to_tsquery terms: alphanumeric only; stem via config in SQL.
  return unique.map((token) => token.replace(/'/g, "''")).join(" | ");
}

export async function hybridRetrieve(
  query: string,
  options: { embed: EmbedFn; limit?: number; pool?: Pool },
): Promise<Passage[]> {
  const text = query.trim();
  if (!text) return [];
  const limit = options.limit ?? 5;
  const pool = options.pool ?? getPool();
  const vector = await options.embed(text);
  const literal = formatVectorLiteral(vector);
  const lexicalTs = buildLexicalTsQuery(text);

  const [vectorHits, lexicalHits] = await Promise.all([
    pool.query<HitRow>(
      `SELECT id::text, content, source,
              (1 - (embedding <=> $1::vector))::float8 AS score
       FROM rag_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [literal, limit],
    ),
    lexicalTs
      ? pool.query<HitRow>(
          `SELECT id::text, content, source,
                  ts_rank(tsv, q)::float8 AS score
           FROM rag_chunks, to_tsquery('english', $1) AS q
           WHERE tsv @@ q
           ORDER BY score DESC
           LIMIT $2`,
          [lexicalTs, limit],
        )
      : Promise.resolve({ rows: [] as HitRow[] }),
  ]);

  const fused = reciprocalRankFuse([
    vectorHits.rows.map((row, index) => ({ id: row.id, rank: index + 1 })),
    lexicalHits.rows.map((row, index) => ({ id: row.id, rank: index + 1 })),
  ]);

  const byId = new Map<string, HitRow>();
  for (const row of [...vectorHits.rows, ...lexicalHits.rows]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }

  return [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .flatMap(([id, score]) => {
      const row = byId.get(id);
      if (!row) return [];
      return [
        {
          id,
          text: row.content,
          score,
          source: row.source,
        },
      ];
    });
}
