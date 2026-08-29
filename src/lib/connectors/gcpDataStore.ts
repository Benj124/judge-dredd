import { htmlToPlainText } from "../graph/htmlText";
import { gcpAccessToken, bearerHeaders, type GoogleServiceAccount } from "./auth";
import { mapDiscoveryEngineList } from "./mapText";
import {
  defaultConnectorFetch,
  requireOk,
  type ConnectorFetch,
  type MappedCorpusDoc,
} from "./types";

/** gs://bucket/object → GCS JSON API alt=media; https URIs pass through. */
export function contentUriToFetchUrl(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith("gs://")) {
    const rest = trimmed.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      throw new Error(`Invalid gs:// URI: ${uri}`);
    }
    const bucket = rest.slice(0, slash);
    const object = rest.slice(slash + 1);
    return (
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}` +
      `/o/${encodeURIComponent(object)}?alt=media`
    );
  }
  return trimmed;
}

function bodyFromFetchedContent(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    const plain = htmlToPlainText(trimmed).fullText.trim();
    return plain || trimmed;
  }
  return trimmed;
}

async function hydrateContentUris(
  docs: MappedCorpusDoc[],
  fetchFn: ConnectorFetch,
  headers: Record<string, string>,
): Promise<MappedCorpusDoc[]> {
  const hydrated: MappedCorpusDoc[] = [];
  for (const doc of docs) {
    if (doc.body.trim()) {
      hydrated.push(doc);
      continue;
    }
    if (!doc.contentUri) continue;
    const url = contentUriToFetchUrl(doc.contentUri);
    const response = await fetchFn(url, { method: "GET", headers });
    requireOk(url, response.status, response.bodyText);
    const body = bodyFromFetchedContent(response.bodyText);
    if (!body) continue;
    hydrated.push({
      ...doc,
      body,
      canonicalUrl: doc.contentUri,
      contentUri: undefined,
    });
  }
  return hydrated;
}

export function discoveryEngineDocumentsUrl(dataStore: string): string {
  let resource = dataStore.trim().replace(/^\/+|\/+$/g, "");
  if (!resource) {
    throw new Error("GCP data store resource name is required");
  }
  if (resource.startsWith("https://")) {
    return resource;
  }
  if (!resource.startsWith("projects/")) {
    resource = `projects/${resource}`;
  }
  if (!/\/dataStores\/[^/]+/.test(resource)) {
    throw new Error(
      "GCP data store must include dataStores/{id}, e.g. projects/{p}/locations/global/collections/default_collection/dataStores/{id}",
    );
  }
  if (!/\/collections\//.test(resource)) {
    resource = resource.replace(
      /\/locations\/([^/]+)\/dataStores\//,
      "/locations/$1/collections/default_collection/dataStores/",
    );
  }
  if (!/\/branches\//.test(resource)) {
    resource = `${resource}/branches/default_branch`;
  }
  if (!resource.endsWith("/documents")) {
    resource = `${resource}/documents`;
  }
  return `https://discoveryengine.googleapis.com/v1/${resource}`;
}

export async function listGcpDataStoreDocuments(options: {
  dataStore: string;
  accessToken?: string;
  serviceAccount?: GoogleServiceAccount;
  fetch?: ConnectorFetch;
}): Promise<{ url: string; authorization: string; documents: MappedCorpusDoc[] }> {
  const fetchFn = options.fetch ?? defaultConnectorFetch;
  const token = await gcpAccessToken({
    accessToken: options.accessToken,
    serviceAccount: options.serviceAccount,
    fetch: fetchFn,
  });
  const url = discoveryEngineDocumentsUrl(options.dataStore);
  const headers = bearerHeaders(token);
  const response = await fetchFn(url, { method: "GET", headers });
  requireOk(url, response.status, response.bodyText);
  let payload: unknown;
  try {
    payload = JSON.parse(response.bodyText);
  } catch {
    throw new Error("GCP data store returned non-JSON");
  }
  const documents = await hydrateContentUris(
    mapDiscoveryEngineList(payload),
    fetchFn,
    headers,
  );
  return {
    url,
    authorization: headers.Authorization,
    documents,
  };
}
