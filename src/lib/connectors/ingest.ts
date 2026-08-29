import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { getPool } from "../db/pool";
import { upsertTextDocument, type TextDocument } from "../graph/store";
import type { GoogleServiceAccount } from "./auth";
import { queryDatabricksVectorIndex } from "./databricksIndex";
import { listGcpDataStoreDocuments } from "./gcpDataStore";
import type { ConnectorFetch, MappedCorpusDoc } from "./types";

export type ConnectorIngestResult = {
  source: "gcp-data-store" | "databricks-index";
  documents: TextDocument[];
};

async function persistMapped(
  docs: MappedCorpusDoc[],
  site: string,
  metaSource: string,
  pool: Pool,
): Promise<TextDocument[]> {
  const stored: TextDocument[] = [];
  for (const doc of docs) {
    stored.push(
      await upsertTextDocument(
        {
          slug: doc.slug,
          title: doc.title,
          canonicalUrl: doc.canonicalUrl,
          fullText: doc.body,
          site,
          httpStatus: 200,
          meta: { source: metaSource, sourceId: doc.sourceId },
        },
        pool,
      ),
    );
  }
  return stored;
}

export function parseServiceAccountJson(
  raw: string | GoogleServiceAccount,
): GoogleServiceAccount {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as GoogleServiceAccount;
  }
  return JSON.parse(readFileSync(trimmed, "utf8")) as GoogleServiceAccount;
}

export async function ingestGcpDataStore(options: {
  dataStore: string;
  accessToken?: string;
  serviceAccount?: string | GoogleServiceAccount;
  fetch?: ConnectorFetch;
  pool?: Pool;
}): Promise<ConnectorIngestResult> {
  const accessToken = options.accessToken?.trim() || undefined;
  const listed = await listGcpDataStoreDocuments({
    dataStore: options.dataStore,
    accessToken,
    serviceAccount:
      !accessToken && options.serviceAccount
        ? parseServiceAccountJson(options.serviceAccount)
        : undefined,
    fetch: options.fetch,
  });
  const documents = await persistMapped(
    listed.documents,
    "gcp-data-store",
    "gcp-data-store",
    options.pool ?? getPool(),
  );
  return { source: "gcp-data-store", documents };
}

export async function ingestDatabricksIndex(options: {
  host: string;
  index: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  query?: string;
  textColumn?: string;
  titleColumn?: string;
  numResults?: number;
  fetch?: ConnectorFetch;
  pool?: Pool;
}): Promise<ConnectorIngestResult> {
  const queried = await queryDatabricksVectorIndex({
    host: options.host,
    index: options.index,
    token: options.token,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    query: options.query,
    textColumn: options.textColumn,
    titleColumn: options.titleColumn,
    numResults: options.numResults,
    fetch: options.fetch,
  });
  const documents = await persistMapped(
    queried.documents,
    "databricks-unity",
    "databricks-index",
    options.pool ?? getPool(),
  );
  return { source: "databricks-index", documents };
}
