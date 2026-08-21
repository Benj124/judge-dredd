import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { upsertTextDocument } from "../graph/store";
import { stubEmbed } from "./embed";
import {
  documentRagSource,
  ingestTextDocumentsToRag,
  loadWhaleTextDocuments,
} from "./ingestDocuments";
import { hybridRetrieve } from "./retrieve";

after(async () => {
  await closePool();
});

test("ingestTextDocumentsToRag multi-chunks, embeds, and hybrid retrieve hits distinctive content", async () => {
  await migrate();
  const pool = getPool();
  const slug = `whale-rag-${Date.now()}`;
  const marker = `quorblax${Date.now()}`;
  const phrase = `The ${marker} megafauna glows sapphire under arctic ice at dusk`;
  const paragraphs = [
    `The test blue whale is a marine mammal. ${phrase}. Researchers log this for hybrid RAG.`,
    "Secondary paragraph about feeding on krill in cold polar waters during summer migrations.",
    "Tertiary paragraph about vocalizations and long-distance communication between pods.",
    "Fourth paragraph about conservation status and ship strike risk in shipping lanes.",
    "Fifth paragraph about historical whaling pressure and modern protection statutes.",
  ];
  const fullText = paragraphs.join("\n\n");
  assert.ok(fullText.length > 400);

  const doc = await upsertTextDocument({
    slug,
    title: "Test blue whale",
    canonicalUrl: `https://en.wikipedia.org/wiki/Test_${slug}`,
    fullText,
    meta: { corpus: "test" },
  });

  const first = await ingestTextDocumentsToRag({
    documents: [doc],
    embed: stubEmbed,
    pool,
    chunkOptions: { maxChars: 220, overlapChars: 40 },
  });
  assert.equal(first.documents, 1);
  assert.ok(
    first.chunks >= 2,
    `expected multiple chunks for multi-paragraph article, got ${first.chunks}`,
  );
  assert.equal(first.bySlug[0].source, documentRagSource(doc));

  const count = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM rag_chunks WHERE source = $1`,
    [doc.canonicalUrl],
  );
  assert.equal(Number(count.rows[0].n), first.chunks);

  const passages = await hybridRetrieve(
    `Where does the ${marker} megafauna glow sapphire at dusk?`,
    { embed: stubEmbed, pool, limit: 12 },
  );
  assert.ok(passages.length > 0, "hybrid retrieve returned no passages");
  const fromDoc = passages.filter((p) => p.source === doc.canonicalUrl);
  assert.ok(
    fromDoc.length > 0,
    `expected hits with source ${doc.canonicalUrl}; got ${passages
      .map((p) => p.source)
      .join(", ")}`,
  );
  assert.ok(
    fromDoc.some((p) => p.text.includes(marker)),
    `expected distinctive marker in doc hits: ${fromDoc
      .map((p) => p.text.slice(0, 100))
      .join(" | ")}`,
  );

  // Idempotent re-run replaces rather than duplicating.
  const second = await ingestTextDocumentsToRag({
    documents: [doc],
    embed: stubEmbed,
    pool,
    chunkOptions: { maxChars: 220, overlapChars: 40 },
  });
  assert.equal(second.chunks, first.chunks);
  assert.ok(second.deleted >= first.chunks);
  const count2 = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM rag_chunks WHERE source = $1`,
    [doc.canonicalUrl],
  );
  assert.equal(Number(count2.rows[0].n), first.chunks);

  await pool.query(`DELETE FROM rag_chunks WHERE source = $1`, [doc.canonicalUrl]);
  await pool.query(`DELETE FROM text_documents WHERE slug = $1`, [slug]);
});

test("loadWhaleTextDocuments only returns seeded whale slugs when present", async () => {
  await migrate();
  const docs = await loadWhaleTextDocuments();
  for (const doc of docs) {
    assert.match(
      doc.slug,
      /^(blue|beluga|humpback|sperm)-whale$|^orca$/,
    );
    assert.ok(doc.fullText.length > 0);
  }
});
