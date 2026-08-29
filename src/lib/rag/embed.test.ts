import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import {
  assertLiveEmbedding,
  getEmbedder,
  stubEmbed,
  stubEmbedSync,
  xaiEmbed,
} from "./embed";
import { LIVE_EMBED_DIM, STUB_EMBED_DIM } from "./models";
import { formatVectorLiteral } from "./embed";
import { insertChunks } from "./retrieve";

after(async () => {
  await closePool();
});

test("stub and live embedding policy: dims, RAG_EMBED_STUB, no truncate-to-32", () => {
  assert.equal(LIVE_EMBED_DIM, 768);
  assert.notEqual(LIVE_EMBED_DIM, 32);
  assert.equal(STUB_EMBED_DIM, LIVE_EMBED_DIM);

  const stub = stubEmbedSync("zinnium crystal");
  assert.equal(stub.length, STUB_EMBED_DIM);

  assert.equal(getEmbedder({ RAG_EMBED_STUB: "1" }), stubEmbed);
  assert.equal(getEmbedder({ EVAL_LLM_STUB: "1" }), stubEmbed);
  assert.equal(getEmbedder({}), xaiEmbed);

  const live = new Array(LIVE_EMBED_DIM).fill(0.01);
  assert.equal(assertLiveEmbedding(live), live);

  const truncated = new Array(32).fill(0.5);
  assert.throws(
    () => assertLiveEmbedding(truncated),
    /refusing to truncate or pad/i,
  );

  const source = readFileSync(join(process.cwd(), "src/lib/rag/embed.ts"), "utf8");
  assert.match(source, /assertLiveEmbedding\(raw\)/);
  assert.doesNotMatch(
    source,
    /return resizeVector\(raw/,
    "live xaiEmbed must not resize/truncate API vectors",
  );
  assert.doesNotMatch(source, /resizeVector\(raw,\s*32\)/);
  assert.doesNotMatch(source, /resizeVector\(raw,\s*EMBED_DIM\)/);
});

test("migrate then insert of a stub vector succeeds at live store dim", async () => {
  await migrate();
  const pool = getPool();
  const source = `embed-dim-${Date.now()}`;
  const vec = stubEmbedSync("stub vector insert check");
  assert.equal(vec.length, LIVE_EMBED_DIM);
  const ids = await insertChunks(
    [{ source, content: "Stub vector insert check for live pgvector dim." }],
    stubEmbed,
    pool,
  );
  assert.equal(ids.length, 1);
  const row = await pool.query<{ dim: string }>(
    `SELECT vector_dims(embedding)::text AS dim FROM rag_chunks WHERE id = $1`,
    [ids[0]],
  );
  assert.equal(Number(row.rows[0].dim), LIVE_EMBED_DIM);
  assert.equal(formatVectorLiteral(vec).startsWith("["), true);
  await pool.query(`DELETE FROM rag_chunks WHERE source = $1`, [source]);
});
