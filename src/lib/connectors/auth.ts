import { createSign } from "node:crypto";
import {
  ConnectorAuthError,
  defaultConnectorFetch,
  requireOk,
  type ConnectorFetch,
} from "./types";

export type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

function base64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signServiceAccountJwt(
  account: GoogleServiceAccount,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const email = account.client_email?.trim();
  const key = account.private_key?.trim();
  if (!email || !key) {
    throw new ConnectorAuthError(
      "GCP service-account JSON must include client_email and private_key",
    );
  }
  const tokenUri = account.token_uri?.trim() || GOOGLE_TOKEN_URI;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: email,
      sub: email,
      aud: tokenUri,
      scope: CLOUD_PLATFORM_SCOPE,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signing = createSign("RSA-SHA256");
  signing.update(`${header}.${payload}`);
  const signature = base64Url(signing.sign(key));
  return `${header}.${payload}.${signature}`;
}

export async function gcpAccessToken(options: {
  accessToken?: string;
  serviceAccount?: GoogleServiceAccount;
  fetch?: ConnectorFetch;
  nowSeconds?: number;
}): Promise<string> {
  const bearer = options.accessToken?.trim();
  if (bearer) return bearer;
  if (!options.serviceAccount) {
    throw new ConnectorAuthError(
      "GCP connector needs GCP_ACCESS_TOKEN / --token or a service-account JSON",
    );
  }
  const assertion = signServiceAccountJwt(
    options.serviceAccount,
    options.nowSeconds,
  );
  const tokenUri =
    options.serviceAccount.token_uri?.trim() || GOOGLE_TOKEN_URI;
  const fetchFn = options.fetch ?? defaultConnectorFetch;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();
  const response = await fetchFn(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  requireOk(tokenUri, response.status, response.bodyText);
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(response.bodyText) as { access_token?: string };
  } catch {
    throw new ConnectorAuthError("GCP token exchange returned non-JSON");
  }
  const token = parsed.access_token?.trim();
  if (!token) {
    throw new ConnectorAuthError("GCP token exchange missing access_token");
  }
  return token;
}

export async function databricksAccessToken(options: {
  host: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  fetch?: ConnectorFetch;
}): Promise<string> {
  const pat = options.token?.trim();
  if (pat) return pat;
  const clientId = options.clientId?.trim();
  const clientSecret = options.clientSecret?.trim();
  if (!clientId || !clientSecret) {
    throw new ConnectorAuthError(
      "Databricks connector needs DATABRICKS_TOKEN / --token or client_id and client_secret",
    );
  }
  const host = options.host.replace(/\/+$/, "");
  if (!host) {
    throw new ConnectorAuthError("Databricks host is required for OAuth");
  }
  const tokenUrl = `${host}/oidc/v1/token`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const fetchFn = options.fetch ?? defaultConnectorFetch;
  const response = await fetchFn(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    }).toString(),
  });
  requireOk(tokenUrl, response.status, response.bodyText);
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(response.bodyText) as { access_token?: string };
  } catch {
    throw new ConnectorAuthError("Databricks OAuth returned non-JSON");
  }
  const token = parsed.access_token?.trim();
  if (!token) {
    throw new ConnectorAuthError("Databricks OAuth missing access_token");
  }
  return token;
}

export function bearerHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
