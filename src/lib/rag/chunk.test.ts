import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkFullText } from "./chunk";

test("chunkFullText returns empty for blank input", () => {
  assert.deepEqual(chunkFullText("   "), []);
});

test("chunkFullText keeps a short article as one chunk", () => {
  const chunks = chunkFullText("The blue whale is large.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, "The blue whale is large.");
  assert.equal(chunks[0].index, 0);
});

test("chunkFullText splits a multi-paragraph article into multiple chunks", () => {
  const paragraphs = Array.from({ length: 12 }, (_, i) => {
    return (
      `Paragraph ${i + 1} about whales. ` +
      "The distinctive zinnium whale phrase appears only for retrieval tests. ".repeat(
        4,
      )
    );
  });
  const fullText = paragraphs.join("\n\n");
  assert.ok(fullText.length > 1600);

  const chunks = chunkFullText(fullText, { maxChars: 500, overlapChars: 50 });
  assert.ok(chunks.length >= 2, `expected multi-chunk split, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.content.trim().length > 0);
    assert.ok(chunk.content.length <= 600, chunk.content.length);
  }
  assert.ok(chunks.some((c) => /zinnium whale/i.test(c.content)));
  assert.equal(chunks[0].index, 0);
  assert.equal(chunks[chunks.length - 1].index, chunks.length - 1);
});
