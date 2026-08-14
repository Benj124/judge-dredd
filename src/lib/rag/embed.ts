import { EMBED_DIM, resolveEmbedModel } from "./models";

export type EmbedFn = (text: string) => Promise<number[]>;

/** Deterministic bag-of-tokens vector so tests never call xAI. */
export function stubEmbedSync(text: string, dim = EMBED_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 33 + token.charCodeAt(i)) >>> 0;
    }
    vec[hash % dim] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

export const stubEmbed: EmbedFn = async (text) => stubEmbedSync(text);

export const xaiEmbed: EmbedFn = async (text) => {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }
  const model = resolveEmbedModel();
  const response = await fetch("https://api.x.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`xAI embeddings failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const raw = data.data?.[0]?.embedding;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("xAI embeddings response missing vector");
  }
  return resizeVector(raw, EMBED_DIM);
};

export function resizeVector(values: number[], dim: number): number[] {
  if (values.length === dim) return values;
  const out = new Array<number>(dim).fill(0);
  const n = Math.min(values.length, dim);
  for (let i = 0; i < n; i += 1) out[i] = values[i];
  const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0)) || 1;
  return out.map((value) => value / norm);
}

export function getEmbedder(
  env: {
    RAG_EMBED_STUB?: string;
    EVAL_LLM_STUB?: string;
  } = process.env as { RAG_EMBED_STUB?: string; EVAL_LLM_STUB?: string },
): EmbedFn {
  if (env.RAG_EMBED_STUB === "1" || env.EVAL_LLM_STUB === "1") {
    return stubEmbed;
  }
  return xaiEmbed;
}

export function formatVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
