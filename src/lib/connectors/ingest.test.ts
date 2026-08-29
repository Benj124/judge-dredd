import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { dispatchSynth } from "../cli/synth";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { stubComplete } from "../eval/complete";
import { ingestDatabricksIndex, ingestGcpDataStore } from "./ingest";

const FIXTURES = join(process.cwd(), "src/lib/connectors/fixtures");

after(async () => {
  await closePool();
});

async function cleanupSlugs(slugs: string[]) {
  const pool = getPool();
  await pool.query(`DELETE FROM datasets WHERE slug = ANY($1::text[])`, [
    slugs.map((slug) => `synth-${slug}`),
  ]);
  await pool.query(`DELETE FROM text_documents WHERE slug = ANY($1::text[])`, [
    slugs,
  ]);
}

test("GCP data-store fixture maps structData and content.rawBytes into stored full text", async () => {
  await migrate();
  const fixture = readFileSync(
    join(FIXTURES, "discovery-engine-documents.json"),
    "utf8",
  );
  assert.match(fixture, /zinnium crystal glows at midnight in the Vertex store/);
  assert.match(fixture, /VW5zdHJ1Y3R1cmVkIGh5ZHJheCBub3RlcyBsaXZlIGluIERpc2NvdmVyeSBFbmdpbmUgY29udGVudC5yYXdCeXRlcy4=/);
  const slugs = ["zinnium-vertex", "unstructured-note"];
  try {
    const result = await ingestGcpDataStore({
      dataStore:
        "projects/demo/locations/global/collections/default_collection/dataStores/articles",
      accessToken: "gcp-raw-bearer",
      fetch: async () => ({ status: 200, bodyText: fixture }),
    });
    assert.equal(result.source, "gcp-data-store");
    assert.equal(result.documents.length, 2);
    const vertex = result.documents.find((doc) => doc.slug === "zinnium-vertex");
    const unstructured = result.documents.find(
      (doc) => doc.slug === "unstructured-note",
    );
    assert.ok(vertex);
    assert.ok(unstructured);
    assert.match(vertex.fullText, /zinnium crystal glows at midnight in the Vertex store/);
    assert.match(
      unstructured.fullText,
      /Unstructured hydrax notes live in Discovery Engine content\.rawBytes/,
    );
    assert.equal(vertex.title, "Zinnium Vertex article");
    assert.doesNotMatch(vertex.fullText, /hardcoded sample prose/i);
  } finally {
    await cleanupSlugs(slugs);
  }
});

test("GCP unstructured content.uri-only docs fetch GCS alt=media with the same Bearer", async () => {
  await migrate();
  const listFixture = readFileSync(
    join(FIXTURES, "discovery-engine-uri-only.json"),
    "utf8",
  );
  const objectProse =
    "Quorblax megafauna nest only in the GCS object behind content.uri.";
  assert.match(listFixture, /gs:\/\/synthkit-corpus\/articles\/quorblax\.txt/);
  assert.doesNotMatch(listFixture, /Quorblax megafauna/);
  assert.doesNotMatch(listFixture, /rawBytes/);
  const slugs = ["quorblax-gcs"];
  const fetches: Array<{ url: string; authorization?: string }> = [];
  try {
    const result = await ingestGcpDataStore({
      dataStore:
        "projects/demo/locations/global/collections/default_collection/dataStores/articles",
      accessToken: "gcp-raw-bearer",
      serviceAccount: "/this/path/does-not-exist-sa.json",
      fetch: async (url, init) => {
        fetches.push({ url, authorization: init?.headers?.Authorization });
        if (url.includes("discoveryengine.googleapis.com")) {
          return { status: 200, bodyText: listFixture };
        }
        if (url.includes("storage.googleapis.com") && url.includes("alt=media")) {
          assert.equal(init?.headers?.Authorization, "Bearer gcp-raw-bearer");
          return { status: 200, bodyText: objectProse };
        }
        throw new Error(`unexpected fetch ${url}`);
      },
    });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].slug, "quorblax-gcs");
    assert.match(result.documents[0].fullText, /Quorblax megafauna nest only in the GCS object/);
    assert.ok(
      fetches.some(
        (row) =>
          row.url.includes("/storage/v1/b/synthkit-corpus/o/") &&
          row.url.includes("alt=media") &&
          row.authorization === "Bearer gcp-raw-bearer",
      ),
    );
  } finally {
    await cleanupSlugs(slugs);
  }
});

test("invalid GOOGLE_APPLICATION_CREDENTIALS path is ignored when a bearer token is set", async () => {
  await assert.rejects(
    () =>
      ingestGcpDataStore({
        dataStore:
          "projects/demo/locations/global/dataStores/articles",
        serviceAccount: "/this/path/does-not-exist-sa.json",
        fetch: async () => {
          throw new Error("fetch must not run");
        },
      }),
    /ENOENT|no such file/i,
  );
});

test("Databricks vector-index fixture maps the configured text column into stored full text", async () => {
  await migrate();
  const fixture = readFileSync(
    join(FIXTURES, "databricks-vector-query.json"),
    "utf8",
  );
  assert.match(fixture, /hydrax protocol feeds on polar ice in the Unity index/);
  const slugs = ["hydrax-unity"];
  try {
    const result = await ingestDatabricksIndex({
      host: "https://example.cloud.databricks.com",
      index: "main.corpus.articles",
      token: "dapi-pat-token",
      textColumn: "text",
      titleColumn: "title",
      fetch: async () => ({ status: 200, bodyText: fixture }),
    });
    assert.equal(result.source, "databricks-index");
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].slug, "hydrax-unity");
    assert.equal(result.documents[0].title, "Hydrax Unity article");
    assert.match(
      result.documents[0].fullText,
      /hydrax protocol feeds on polar ice in the Unity index/,
    );
  } finally {
    await cleanupSlugs(slugs);
  }
});

test("connector ingest then dispatchSynth generate --keep and run on the slug", async () => {
  await migrate();
  const fixture = readFileSync(
    join(FIXTURES, "discovery-engine-documents.json"),
    "utf8",
  );
  const slug = "zinnium-vertex";
  try {
    const ingested = await dispatchSynth(
      [
        "ingest",
        "--gcp-data-store",
        "projects/demo/locations/global/collections/default_collection/dataStores/articles",
        "--token",
        "gcp-raw-bearer",
      ],
      {
        migrate,
        fetch: async () => ({ status: 200, bodyText: fixture }),
      },
    );
    const ingestPayload = ingested.payload as { slugs: string[]; source: string };
    assert.equal(ingested.command, "ingest");
    assert.equal(ingestPayload.source, "gcp-data-store");
    assert.ok(ingestPayload.slugs.includes(slug));

    const generate = await dispatchSynth(
      ["generate", "--slug", slug, "--n", "2", "--keep"],
      {
        migrate,
        complete: async () =>
          JSON.stringify({
            questions: [
              {
                question: "When does the zinnium crystal glow in the Vertex store?",
                expected_facts: [
                  "The zinnium crystal glows at midnight in the Vertex store.",
                ],
                difficulty: "easy",
              },
              {
                question: "Where are the unstructured hydrax notes stored?",
                expected_facts: [
                  "Unstructured hydrax notes live in Discovery Engine content.rawBytes.",
                ],
                difficulty: "medium",
              },
            ],
          }),
      },
    );
    const gen = generate.payload as { versionId: string; slug: string; kept: boolean };
    assert.equal(generate.command, "generate");
    assert.equal(gen.slug, slug);
    assert.equal(gen.kept, true);

    const run = await dispatchSynth(["run", "--versionId", gen.versionId], {
      migrate,
      judge: stubComplete,
      generate: async ({ context }) => `Stub generated answer to: ${context}`,
    });
    assert.equal(run.command, "run");
    assert.equal(
      (run.payload as { datasetVersion: string }).datasetVersion,
      gen.versionId,
    );
    assert.ok((run.payload as { campaignId: string }).campaignId);
  } finally {
    await cleanupSlugs([slug, "unstructured-note"]);
  }
});
