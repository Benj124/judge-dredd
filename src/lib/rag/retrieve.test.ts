import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { getEmbedder, stubEmbed } from "./embed";
import { reciprocalRankFuse } from "./fuse";
import { runRetrieveGraph } from "./graph";
import { DEFAULT_EMBED_MODEL, isFrontierEmbedModel } from "./models";
import { buildLexicalTsQuery, hybridRetrieve, insertChunks } from "./retrieve";

after(async () => {
  await closePool();
});

test("buildLexicalTsQuery ORs distinctive tokens for natural-language recall", () => {
  const q = buildLexicalTsQuery(
    "Is this claim grounded?\nThe briefing claims the zinnium crystal glows at midnight.",
  );
  assert.match(q, /zinnium/);
  assert.match(q, /crystal/);
  assert.match(q, /\|/);
  assert.equal(buildLexicalTsQuery("  a b  "), "");
});

test("default embed model is cheap and not a frontier chat alias", () => {
  assert.equal(isFrontierEmbedModel(DEFAULT_EMBED_MODEL), false);
  assert.equal(isFrontierEmbedModel("grok-4.6"), true);
  assert.equal(getEmbedder({ RAG_EMBED_STUB: "1" }), stubEmbed);
});

test("reciprocalRankFuse prefers items that rank well on both lists", () => {
  const fused = reciprocalRankFuse([
    [
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
    ],
    [
      { id: "a", rank: 2 },
      { id: "c", rank: 1 },
    ],
  ]);
  assert.ok((fused.get("a") ?? 0) > (fused.get("b") ?? 0));
  assert.ok((fused.get("a") ?? 0) > 0);
});

test("hybridRetrieve and the graph entry return scored passages via a fake embedder", async () => {
  await migrate();
  const pool = getPool();
  const marker = `rag-test-${Date.now()}`;
  await insertChunks(
    [
      { source: marker, content: "The capital of France is Paris." },
      { source: marker, content: "Penguins live in cold southern climates." },
      { source: marker, content: "A bicycle has two wheels and pedals." },
    ],
    stubEmbed,
    pool,
  );

  const passages = await hybridRetrieve("What is the capital of France?", {
    embed: stubEmbed,
    pool,
  });
  assert.ok(passages.length > 0);
  for (const passage of passages) {
    assert.ok(passage.id);
    assert.ok(passage.text.trim());
    assert.equal(typeof passage.score, "number");
    assert.ok(Number.isFinite(passage.score));
  }
  assert.ok(
    passages.some((passage) => /paris/i.test(passage.text)),
    "expected the France/Paris chunk among hybrid hits",
  );

  const fromGraph = await runRetrieveGraph("capital of France", stubEmbed);
  assert.ok(fromGraph.length > 0);
  assert.ok(fromGraph[0].text.trim());
  assert.equal(typeof fromGraph[0].score, "number");
});
