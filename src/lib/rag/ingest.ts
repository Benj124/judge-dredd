import type { Pool } from "pg";
import { getPool } from "../db/pool";
import type { EmbedFn } from "./embed";
import { insertChunks } from "./retrieve";

export type SourceText = {
  text: string;
  source?: string | null;
};

export async function ingestSources(
  sources: SourceText[],
  embed: EmbedFn,
  pool: Pool = getPool(),
): Promise<{ ids: string[]; count: number }> {
  const chunks = sources
    .map((item) => ({
      content: item.text.trim(),
      source: item.source ?? null,
    }))
    .filter((item) => item.content.length > 0);
  const ids = await insertChunks(chunks, embed, pool);
  return { ids, count: ids.length };
}
