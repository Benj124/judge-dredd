import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  bearerHeaders,
  databricksAccessToken,
  gcpAccessToken,
  signServiceAccountJwt,
} from "./auth";
import { ConnectorAuthError } from "./types";
import { queryDatabricksVectorIndex } from "./databricksIndex";
import { listGcpDataStoreDocuments } from "./gcpDataStore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(process.cwd(), "src/lib/connectors/fixtures");

function testServiceAccount() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    client_email: "synthkit@demo.iam.gserviceaccount.com",
    private_key: pem,
    token_uri: "https://oauth2.googleapis.com/token",
  };
}

test("empty GCP and Databricks credentials fail closed before fetch", async () => {
  await assert.rejects(
    () =>
      gcpAccessToken({
        fetch: async () => {
          throw new Error("fetch must not run without credentials");
        },
      }),
    ConnectorAuthError,
  );
  await assert.rejects(
    () =>
      databricksAccessToken({
        host: "https://example.cloud.databricks.com",
        fetch: async () => {
          throw new Error("fetch must not run without credentials");
        },
      }),
    ConnectorAuthError,
  );
});

test("GCP bearer token and SA JSON attach Authorization Bearer on the data-store URL", async () => {
  const fixture = readFileSync(
    join(FIXTURES, "discovery-engine-documents.json"),
    "utf8",
  );

  const bearerListed = await listGcpDataStoreDocuments({
    dataStore:
      "projects/demo/locations/global/collections/default_collection/dataStores/articles",
    accessToken: "gcp-raw-bearer",
    fetch: async (url, init) => {
      assert.match(url, /discoveryengine\.googleapis\.com/);
      assert.equal(init?.headers?.Authorization, "Bearer gcp-raw-bearer");
      return { status: 200, bodyText: fixture };
    },
  });
  assert.equal(bearerListed.authorization, "Bearer gcp-raw-bearer");
  assert.match(bearerListed.url, /discoveryengine\.googleapis\.com/);

  const sa = testServiceAccount();
  const jwt = signServiceAccountJwt(sa, 1_700_000_000);
  assert.match(jwt, /^eyJ/);

  const saCalls: Array<{ url: string; authorization?: string }> = [];
  const saListed = await listGcpDataStoreDocuments({
    dataStore: "projects/demo/locations/global/dataStores/articles",
    serviceAccount: sa,
    fetch: async (url, init) => {
      saCalls.push({ url, authorization: init?.headers?.Authorization });
      if (url.includes("oauth2.googleapis.com/token")) {
        assert.match(init?.body ?? "", /assertion=/);
        return {
          status: 200,
          bodyText: JSON.stringify({ access_token: "gcp-exchanged-token" }),
        };
      }
      return { status: 200, bodyText: fixture };
    },
  });
  assert.equal(saListed.authorization, "Bearer gcp-exchanged-token");
  const storeCall = saCalls.find((row) =>
    row.url.includes("discoveryengine.googleapis.com"),
  );
  assert.equal(storeCall?.authorization, "Bearer gcp-exchanged-token");
});

test("Databricks PAT and client_id/client_secret attach Authorization Bearer on the index query", async () => {
  const fixture = readFileSync(
    join(FIXTURES, "databricks-vector-query.json"),
    "utf8",
  );
  const seen: Array<{ url: string; authorization?: string; method?: string }> =
    [];

  const pat = await queryDatabricksVectorIndex({
    host: "https://example.cloud.databricks.com",
    index: "main.corpus.articles",
    token: "dapi-pat-token",
    fetch: async (url, init) => {
      seen.push({
        url,
        authorization: init?.headers?.Authorization,
        method: init?.method,
      });
      return { status: 200, bodyText: fixture };
    },
  });
  assert.equal(pat.authorization, "Bearer dapi-pat-token");
  assert.match(pat.url, /\/api\/2\.0\/vector-search\/indexes\//);
  assert.equal(seen[0]?.method, "POST");

  const oauth = await queryDatabricksVectorIndex({
    host: "https://example.cloud.databricks.com",
    index: "main.corpus.articles",
    clientId: "sp-client",
    clientSecret: "sp-secret",
    fetch: async (url, init) => {
      seen.push({
        url,
        authorization: init?.headers?.Authorization,
        method: init?.method,
      });
      if (url.endsWith("/oidc/v1/token")) {
        assert.match(init?.headers?.Authorization ?? "", /^Basic /);
        return {
          status: 200,
          bodyText: JSON.stringify({ access_token: "dbx-oauth-token" }),
        };
      }
      return { status: 200, bodyText: fixture };
    },
  });
  assert.equal(oauth.authorization, "Bearer dbx-oauth-token");
  assert.ok(
    seen.some(
      (row) =>
        row.url.includes("/vector-search/indexes/") &&
        row.authorization === "Bearer dbx-oauth-token",
    ),
  );
  assert.equal(
    bearerHeaders("dbx-oauth-token").Authorization,
    "Bearer dbx-oauth-token",
  );
});
