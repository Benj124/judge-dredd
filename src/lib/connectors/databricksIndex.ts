import { bearerHeaders, databricksAccessToken } from "./auth";
import { mapDatabricksQueryResult } from "./mapText";
import {
  defaultConnectorFetch,
  requireOk,
  type ConnectorFetch,
  type MappedCorpusDoc,
} from "./types";

export function databricksIndexQueryUrl(host: string, indexName: string): string {
  const base = host.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Databricks host is required");
  const index = indexName.trim();
  if (!index) throw new Error("Databricks vector search index name is required");
  return `${base}/api/2.0/vector-search/indexes/${encodeURIComponent(index)}/query`;
}

export async function queryDatabricksVectorIndex(options: {
  host: string;
  index: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  query?: string;
  numResults?: number;
  textColumn?: string;
  titleColumn?: string;
  columns?: string[];
  fetch?: ConnectorFetch;
}): Promise<{ url: string; authorization: string; documents: MappedCorpusDoc[] }> {
  const fetchFn = options.fetch ?? defaultConnectorFetch;
  const token = await databricksAccessToken({
    host: options.host,
    token: options.token,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    fetch: fetchFn,
  });
  const url = databricksIndexQueryUrl(options.host, options.index);
  const headers = {
    ...bearerHeaders(token),
    "Content-Type": "application/json",
  };
  const textColumn = options.textColumn?.trim() || "text";
  const titleColumn = options.titleColumn?.trim() || "title";
  const columns = [
    ...new Set([
      ...(options.columns ?? []),
      "id",
      titleColumn,
      textColumn,
      "title",
      "text",
      "content",
      "url",
    ]),
  ];
  const body = JSON.stringify({
    query_text: options.query?.trim() || "*",
    columns,
    num_results:
      options.numResults && options.numResults > 0 ? options.numResults : 25,
  });
  const response = await fetchFn(url, { method: "POST", headers, body });
  requireOk(url, response.status, response.bodyText);
  let payload: unknown;
  try {
    payload = JSON.parse(response.bodyText);
  } catch {
    throw new Error("Databricks vector search returned non-JSON");
  }
  return {
    url,
    authorization: headers.Authorization,
    documents: mapDatabricksQueryResult(payload, { textColumn, titleColumn }),
  };
}
