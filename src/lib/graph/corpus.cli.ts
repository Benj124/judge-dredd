import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import {
  ingestLocalFile,
  ingestPaste,
  ingestSitemap,
  ingestUrl,
  ingestWikipediaHtml,
} from "./corpus";
import { readFileSync } from "node:fs";

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  await migrate();
  const title = argValue("--title");
  const body = argValue("--body");
  const file = argValue("--file");
  const url = argValue("--url");
  const sitemap = argValue("--sitemap");
  const wikipedia = argValue("--wikipedia");
  const htmlFile = argValue("--html");
  const slug = argValue("--slug");

  if (hasFlag("--paste") || (title && body && !file && !url && !sitemap)) {
    if (!title || !body) {
      throw new Error("Paste ingest requires --title and --body");
    }
    const doc = await ingestPaste({ title, body, slug });
    process.stdout.write(
      JSON.stringify(
        { kind: "paste", slug: doc.slug, title: doc.title, chars: doc.fullText.length },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (file) {
    const doc = await ingestLocalFile(file);
    process.stdout.write(
      JSON.stringify(
        {
          kind: "file",
          slug: doc.slug,
          title: doc.title,
          chars: doc.fullText.length,
          url: doc.canonicalUrl,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (sitemap) {
    const result = await ingestSitemap(sitemap);
    process.stdout.write(
      JSON.stringify(
        {
          kind: "sitemap",
          documents: result.documents.map((doc) => ({
            slug: doc.slug,
            title: doc.title,
            url: doc.canonicalUrl,
          })),
          errors: result.errors,
        },
        null,
        2,
      ) + "\n",
    );
    if (result.errors.length > 0) process.exitCode = 1;
    return;
  }

  if (wikipedia) {
    if (!htmlFile) {
      const doc = await ingestUrl(wikipedia);
      process.stdout.write(
        JSON.stringify(
          { kind: "wikipedia", slug: doc.slug, title: doc.title, chars: doc.fullText.length },
          null,
          2,
        ) + "\n",
      );
      return;
    }
    const html = readFileSync(htmlFile, "utf8");
    const doc = await ingestWikipediaHtml({ url: wikipedia, html });
    process.stdout.write(
      JSON.stringify(
        { kind: "wikipedia", slug: doc.slug, title: doc.title, chars: doc.fullText.length },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (url) {
    const doc = await ingestUrl(url);
    process.stdout.write(
      JSON.stringify(
        { kind: "url", slug: doc.slug, title: doc.title, chars: doc.fullText.length, url: doc.canonicalUrl },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  throw new Error(
    "Usage: npm run ingest -- --file path.md|.txt|.html|.pdf | --paste --title T --body B | --url URL | --sitemap path.xml | --wikipedia URL [--html fixture.html]",
  );
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
