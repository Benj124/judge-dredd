import { gcpAccessToken, bearerHeaders, type GoogleServiceAccount } from "./auth";
import { mapDiscoveryEngineList } from "./mapText";
import {
  defaultConnectorFetch,
  requireOk,
  type ConnectorFetch,
  type MappedCorpusDoc,
} from "./types";

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
  return {
    url,
    authorization: headers.Authorization,
    documents: mapDiscoveryEngineList(payload),
  };
}
