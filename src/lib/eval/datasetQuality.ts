import { jaccard, tokenize } from "../graph/synthCoverage";
import { questionSimilarity } from "../graph/synthDedup";
import type { JudgeComplete } from "./types";

export type ClaimCheckTarget = {
  sourceText?: string;
  chunks?: Array<{ text: string; source?: string | null }>;
};

export type FactClaimResult = {
  fact: string;
  inSource: boolean;
  inChunks: boolean;
  passed: boolean;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function distinctiveTokens(text: string): string[] {
  return [...tokenize(text)].filter((token) => token.length >= 4);
}

export function textSupportsFact(haystack: string, fact: string): boolean {
  const source = normalize(haystack);
  const needle = normalize(fact);
  if (!needle) return false;
  if (source.includes(needle)) return true;
  const tokens = distinctiveTokens(fact);
  if (tokens.length === 0) return source.includes(needle);
  const hits = tokens.filter((token) => source.includes(token)).length;
  if (hits === tokens.length) return true;
  return jaccard(tokenize(haystack), tokenize(fact)) >= 0.45;
}

export function claimCheckFact(
  fact: string,
  target: ClaimCheckTarget,
): FactClaimResult {
  const sourceText = target.sourceText ?? "";
  const chunkText = (target.chunks ?? []).map((chunk) => chunk.text).join("\n");
  const inSource = sourceText.trim() ? textSupportsFact(sourceText, fact) : false;
  const inChunks = chunkText.trim() ? textSupportsFact(chunkText, fact) : false;
  return {
    fact,
    inSource,
    inChunks,
    passed: inSource || inChunks,
  };
}

export function claimCheckFacts(
  facts: string[],
  target: ClaimCheckTarget,
): { facts: FactClaimResult[]; passed: boolean } {
  const rows = facts.map((fact) => claimCheckFact(fact, target));
  return { facts: rows, passed: rows.every((row) => row.passed) };
}

export type SimilarPair = {
  i: number;
  j: number;
  score: number;
  a: string;
  b: string;
};

export function interItemSimilarity(
  questions: string[],
  threshold = 0.55,
): { pairs: SimilarPair[]; flagged: boolean } {
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      const score = questionSimilarity(questions[i], questions[j]);
      if (score >= threshold) {
        pairs.push({
          i,
          j,
          score,
          a: questions[i],
          b: questions[j],
        });
      }
    }
  }
  return { pairs, flagged: pairs.length > 0 };
}

export type BenchmarkItem = {
  id: string;
  question: string;
  source?: string;
};

export function contaminationVsBenchmark(
  question: string,
  benchmark: BenchmarkItem[],
  threshold = 0.55,
): {
  contaminated: boolean;
  matches: Array<{ id: string; score: number; question: string }>;
} {
  const matches: Array<{ id: string; score: number; question: string }> = [];
  for (const item of benchmark) {
    const score = questionSimilarity(question, item.question);
    if (score >= threshold) {
      matches.push({ id: item.id, score, question: item.question });
    }
  }
  return { contaminated: matches.length > 0, matches };
}

export type CritiqueDecision = "accept" | "reject";

export type CritiqueResult = {
  decision: CritiqueDecision;
  rationale: string;
  marksGold: false;
};

export async function critiqueItem(
  item: { question: string; expected_facts: string[] },
  complete: JudgeComplete,
  model = "grok-4.20-0309-non-reasoning",
): Promise<CritiqueResult> {
  const raw = await complete({
    model,
    system:
      "You critique a candidate eval item before it can become gold. " +
      'Reply with JSON only: {"decision":"accept"|"reject","rationale":"..."}. ' +
      "Do not mark the item gold.",
    user: JSON.stringify({
      question: item.question,
      expected_facts: item.expected_facts,
    }),
  });
  let decision: CritiqueDecision = "reject";
  let rationale = raw.trim();
  try {
    const parsed = JSON.parse(raw) as {
      decision?: string;
      rationale?: string;
    };
    if (parsed.decision === "accept" || parsed.decision === "reject") {
      decision = parsed.decision;
    }
    if (typeof parsed.rationale === "string" && parsed.rationale.trim()) {
      rationale = parsed.rationale.trim();
    }
  } catch {
    if (/\baccept\b/i.test(raw) && !/\breject\b/i.test(raw)) {
      decision = "accept";
    }
  }
  return { decision, rationale, marksGold: false };
}
