/** Cheap embedding alias — not a flagship/frontier chat model. */
export const DEFAULT_EMBED_MODEL = "grok-embedding-small";
export const EMBED_DIM = 32;

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
