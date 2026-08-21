import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { cleanWikipediaHtml } from "./clean";

export type ScrapeResult = {
  url: string;
  finalUrl: string;
  title: string;
  fullText: string;
  html: string;
  httpStatus: number | null;
};

export type ScrapeOptions = {
  /** Injected browser for tests or shared CLI lifecycle. */
  browser?: Browser;
  timeoutMs?: number;
  userAgent?: string;
};

const DEFAULT_UA =
  "JudgeDreddGraphBot/0.1 (local ETL; educational; contact: local-dev)";

/**
 * Load a Wikipedia article with Playwright and return cleaned full text.
 * Prefer reusing one browser across seeds for speed.
 */
export async function scrapeWikipediaArticle(
  url: string,
  options: ScrapeOptions = {},
): Promise<ScrapeResult> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const userAgent = options.userAgent ?? DEFAULT_UA;
  const ownsBrowser = !options.browser;
  const browser =
    options.browser ??
    (await chromium.launch({
      headless: true,
    }));

  try {
    const page = await browser.newPage({
      userAgent,
      viewport: { width: 1280, height: 720 },
    });
    try {
      return await scrapeWithPage(page, url, timeoutMs);
    } finally {
      await page.close();
    }
  } finally {
    if (ownsBrowser) {
      await browser.close();
    }
  }
}

async function scrapeWithPage(
  page: Page,
  url: string,
  timeoutMs: number,
): Promise<ScrapeResult> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  // Article body is server-rendered; short settle helps late chrome scripts.
  await page.waitForSelector("#mw-content-text", { timeout: timeoutMs });

  const html = await page.content();
  const cleaned = cleanWikipediaHtml(html);
  const heading = await page
    .locator("h1#firstHeading")
    .first()
    .textContent()
    .catch(() => null);

  return {
    url,
    finalUrl: page.url(),
    title: (heading ?? cleaned.title).trim() || cleaned.title,
    fullText: cleaned.fullText,
    html,
    httpStatus: response?.status() ?? null,
  };
}

export async function launchScrapeBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}
