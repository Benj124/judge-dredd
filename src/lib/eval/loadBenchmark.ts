import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchmarkItem } from "./datasetQuality";

export const PUBLIC_BENCHMARK_FIXTURE = "src/lib/eval/fixtures/public-benchmark.jsonl";

export function loadPublicBenchmarkFixture(
  filename = PUBLIC_BENCHMARK_FIXTURE,
): BenchmarkItem[] {
  const text = readFileSync(join(process.cwd(), filename), "utf8");
  const items: BenchmarkItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as BenchmarkItem;
    if (parsed.id && parsed.question) items.push(parsed);
  }
  return items;
}
