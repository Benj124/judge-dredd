import { jaccard, tokenize } from "../graph/synthCoverage";

export type GoldPassage = {
  doc_uri?: string;
  slug?: string;
  content?: string;
};

export type RankedPassage = {
  id?: string;
  text: string;
  source?: string | null;
  score?: number;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function passageMatchesGold(
  retrieved: RankedPassage,
  gold: GoldPassage,
): boolean {
  const source = (retrieved.source ?? "").trim();
  if (gold.doc_uri && source && source === gold.doc_uri) return true;
  if (gold.slug && source && source.includes(gold.slug)) return true;
  const goldText = gold.content?.trim();
  if (!goldText) return Boolean(gold.doc_uri && source === gold.doc_uri);
  const got = normalize(retrieved.text);
  const want = normalize(goldText);
  if (got.includes(want) || want.includes(got)) return true;
  return jaccard(tokenize(retrieved.text), tokenize(goldText)) >= 0.4;
}

function firstHitRank(
  gold: GoldPassage[],
  retrieved: RankedPassage[],
): number | null {
  for (let i = 0; i < retrieved.length; i += 1) {
    if (gold.some((item) => passageMatchesGold(retrieved[i], item))) {
      return i + 1;
    }
  }
  return null;
}

export function recallAtK(
  gold: GoldPassage[],
  retrieved: RankedPassage[],
  k: number,
): number {
  if (gold.length === 0) return 0;
  const top = retrieved.slice(0, Math.max(0, k));
  let hits = 0;
  for (const item of gold) {
    if (top.some((row) => passageMatchesGold(row, item))) hits += 1;
  }
  return hits / gold.length;
}

export function meanReciprocalRank(
  gold: GoldPassage[],
  retrieved: RankedPassage[],
): number {
  if (gold.length === 0) return 0;
  const rank = firstHitRank(gold, retrieved);
  if (rank === null) return 0;
  return 1 / rank;
}

export function scoreRetrievalGold(
  gold: GoldPassage[],
  retrieved: RankedPassage[],
  k = 5,
): { recallAtK: number; mrr: number; k: number } {
  return {
    k,
    recallAtK: recallAtK(gold, retrieved, k),
    mrr: meanReciprocalRank(gold, retrieved),
  };
}

export function parseExpectedRetrievedContext(body: unknown): GoldPassage[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const raw =
    record.expectedRetrievedContext ?? record.expected_retrieved_context;
  if (!Array.isArray(raw)) return [];
  const gold: GoldPassage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const passage: GoldPassage = {};
    if (typeof row.doc_uri === "string") passage.doc_uri = row.doc_uri;
    if (typeof row.docUri === "string") passage.doc_uri = row.docUri;
    if (typeof row.slug === "string") passage.slug = row.slug;
    if (typeof row.content === "string") passage.content = row.content;
    if (passage.doc_uri || passage.slug || passage.content) gold.push(passage);
  }
  return gold;
}
