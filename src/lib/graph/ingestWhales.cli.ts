import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { ingestWhaleWikipediaArticles } from "./ingestWhales";
import { WHALE_WIKIPEDIA_SEEDS } from "./seeds";

async function main() {
  await migrate();
  process.stdout.write(
    `Scraping ${WHALE_WIKIPEDIA_SEEDS.length} Wikipedia whale articles with Playwright…\n`,
  );

  const result = await ingestWhaleWikipediaArticles();

  for (const item of result.items) {
    process.stdout.write(
      `  ok  ${item.seed.slug}  chars=${item.charCount}  hash=${item.contentHash.slice(0, 12)}…\n`,
    );
  }
  for (const err of result.errors) {
    process.stderr.write(`  err ${err.slug}: ${err.error}\n`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        scraped: result.items.length,
        failed: result.errors.length,
        seeds: WHALE_WIKIPEDIA_SEEDS.map((seed) => seed.slug),
        documents: result.items.map((item) => ({
          slug: item.document.slug,
          title: item.document.title,
          url: item.document.canonicalUrl,
          charCount: item.charCount,
          contentHash: item.contentHash,
          id: item.document.id,
        })),
        errors: result.errors,
      },
      null,
      2,
    ) + "\n",
  );

  await closePool();
  if (result.errors.length > 0 || result.items.length === 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
