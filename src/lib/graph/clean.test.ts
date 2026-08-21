import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cleanWikipediaHtml, contentHash } from "./clean";

test("cleanWikipediaHtml strips chrome and keeps article prose", () => {
  const html = readFileSync(
    join(process.cwd(), "src/lib/graph/fixtures/blue-whale.fragment.html"),
    "utf8",
  );
  const { title, fullText } = cleanWikipediaHtml(html);

  assert.equal(title, "Blue whale");
  assert.match(fullText, /largest animal known ever to have existed/i);
  assert.match(fullText, /long tapering body/i);
  assert.doesNotMatch(fullText, /Balaenoptera musculus\n/);
  assert.doesNotMatch(fullText, /Example ref/i);
  assert.doesNotMatch(fullText, /External links/i);
  assert.doesNotMatch(fullText, /\[1\]/);
  assert.doesNotMatch(fullText, /\[edit\]/i);
  assert.ok(fullText.length > 80);
});

test("contentHash is stable for the same full text", () => {
  assert.equal(contentHash("hello whales"), contentHash("hello whales"));
  assert.notEqual(contentHash("hello whales"), contentHash("hello orcas"));
});
