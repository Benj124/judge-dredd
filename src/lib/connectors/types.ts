export type ConnectorFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ status: number; bodyText: string }>;

export type MappedCorpusDoc = {
  title: string;
  body: string;
  slug: string;
  canonicalUrl: string;
  sourceId: string;
  /** Discovery Engine content.uri when body is not inline (gs:// or https). */
  contentUri?: string;
};

export class ConnectorAuthError extends Error {}
export class ConnectorHttpError extends Error {}

export async function defaultConnectorFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{ status: number; bodyText: string }> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body,
  });
  return { status: response.status, bodyText: await response.text() };
}

export function requireOk(
  url: string,
  status: number,
  bodyText: string,
): void {
  if (status < 200 || status >= 300) {
    throw new ConnectorHttpError(
      `${url} returned ${status}: ${bodyText.slice(0, 240)}`,
    );
  }
}
