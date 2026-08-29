/** Cheap embedding alias — not a flagship/frontier chat model. */
export const DEFAULT_EMBED_MODEL = "grok-embedding-small";

/**
 * Deterministic bag-of-tokens stub (`RAG_EMBED_STUB=1`). Same width as the
 * pgvector column so tests can insert; this is not a real embedding model.
 */
export const STUB_EMBED_DIM = 768;

/**
 * Live xAI embedding width. `rag_chunks.embedding` and `xaiEmbed` use this.
 * Never truncated to 32.
 */
export const LIVE_EMBED_DIM = 768;

/** Store dimension: live and stub insert the same width. */
export const EMBED_DIM = LIVE_EMBED_DIM;

const FRONTIER = /^(grok-4\.5|grok-4\.6|grok-4$|grok-4-latest)/i;

export function isFrontierEmbedModel(model: string): boolean {
  return FRONTIER.test(model.trim());
}

export function resolveEmbedModel(override?: string): string {
  const model = override?.trim() || process.env.RAG_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
  if (isFrontierEmbedModel(model)) {
    throw new Error(`Embed model "${model}" is a frontier alias; use a cheap embedding model`);
  }
  return model;
}
