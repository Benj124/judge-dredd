import type { Browser } from "playwright";
import type { Pool } from "pg";
import { getPool } from "../db/pool";
import { contentHash } from "./clean";
import { launchScrapeBrowser, scrapeWikipediaArticle } from "./scrape";
import { WHALE_WIKIPEDIA_SEEDS, type GraphSeed } from "./seeds";
import {
  upsertTextDocument,
  type TextDocument,
} from "./store";

export type WhaleIngestItem = {
  seed: GraphSeed;
  document: TextDocument;
  charCount: number;
  contentHash: string;
};

export type WhaleIngestResult = {
  items: WhaleIngestItem[];
  errors: Array<{ slug: string; url: string; error: string }>;
};

export type IngestWhalesOptions = {
  seeds?: GraphSeed[];
  pool?: Pool;
  browser?: Browser;
  /** When set, skip live scrape and use provided full text (tests). */
  offlineTexts?: Record<string, { title: string; fullText: string }>;
};

/**
 * Scrape the whale Wikipedia seeds (or apply offline fixtures) and upsert full text.
 */
export async function ingestWhaleWikipediaArticles(
  options: IngestWhalesOptions = {},
): Promise<WhaleIngestResult> {
  const seeds = options.seeds ?? WHALE_WIKIPEDIA_SEEDS;
  const pool = options.pool ?? getPool();
  const items: WhaleIngestItem[] = [];
  const errors: WhaleIngestResult["errors"] = [];

  if (options.offlineTexts) {
    for (const seed of seeds) {
      const offline = options.offlineTexts[seed.slug];
      if (!offline?.fullText?.trim()) {
        errors.push({
          slug: seed.slug,
          url: seed.url,
          error: "Missing offline full text for seed",
        });
        continue;
      }
      try {
        const document = await upsertTextDocument(
          {
            slug: seed.slug,
            title: offline.title || seed.label,
            canonicalUrl: seed.url,
            fullText: offline.fullText,
            site: "en.wikipedia.org",
            httpStatus: 200,
            meta: {
              label: seed.label,
              source: "offline-fixture",
              corpus: "whales-v0",
            },
          },
          pool,
        );
        items.push({
          seed,
          document,
          charCount: document.fullText.length,
          contentHash: document.contentHash,
        });
      } catch (error) {
        errors.push({
          slug: seed.slug,
          url: seed.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { items, errors };
  }

  const ownsBrowser = !options.browser;
  const browser = options.browser ?? (await launchScrapeBrowser());
  try {
    for (const seed of seeds) {
      try {
        const scraped = await scrapeWikipediaArticle(seed.url, { browser });
        if (!scraped.fullText.trim()) {
          throw new Error("Cleaner returned empty full text");
        }
        if (scraped.httpStatus && scraped.httpStatus >= 400) {
          throw new Error(`HTTP ${scraped.httpStatus} for ${seed.url}`);
        }
        const document = await upsertTextDocument(
          {
            slug: seed.slug,
            title: scraped.title || seed.label,
            canonicalUrl: seed.url,
            fullText: scraped.fullText,
            site: "en.wikipedia.org",
            httpStatus: scraped.httpStatus,
            meta: {
              label: seed.label,
              finalUrl: scraped.finalUrl,
              source: "playwright-wikipedia",
              corpus: "whales-v0",
              rawHash: contentHash(scraped.html),
            },
          },
          pool,
        );
        items.push({
          seed,
          document,
          charCount: document.fullText.length,
          contentHash: document.contentHash,
        });
      } catch (error) {
        errors.push({
          slug: seed.slug,
          url: seed.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    if (ownsBrowser) {
      await browser.close();
    }
  }

  return { items, errors };
}
