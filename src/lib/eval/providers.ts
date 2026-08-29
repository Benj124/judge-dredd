import { XAI_BASE_URL, XaiConfigError, getXaiApiKeys } from "./xai";
import type { JudgeComplete } from "./types";

export type ChatFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<Response>;

export type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  fetch?: ChatFetch;
};

/**
 * OpenAI-compatible chat.completions complete (subjects / system-under-test).
 * Inject `fetch` in tests. xAI is one backend of this shape.
 */
export function openaiCompatibleComplete(
  config: OpenAICompatibleConfig,
): JudgeComplete {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const fetchFn = config.fetch ?? (globalThis.fetch as ChatFetch);
  return async ({ system, user, model }) => {
    if (!config.apiKey.trim()) {
      throw new Error("API key is not set");
    }
    const response = await fetchFn(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `chat completions failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("chat completions response missing message content");
    }
    return content;
  };
}

export type SubjectProvider = "xai" | "openai";

export function getSubjectComplete(options: {
  provider: SubjectProvider;
  apiKey?: string;
  baseUrl?: string;
  fetch?: ChatFetch;
  env?: NodeJS.ProcessEnv;
}): JudgeComplete {
  if (options.provider === "openai") {
    const apiKey =
      options.apiKey?.trim() ||
      options.env?.OPENAI_API_KEY?.trim() ||
      "";
    const baseUrl =
      options.baseUrl?.trim() ||
      options.env?.OPENAI_BASE_URL?.trim() ||
      "https://api.openai.com/v1";
    return openaiCompatibleComplete({
      baseUrl,
      apiKey,
      fetch: options.fetch,
    });
  }
  const apiKey =
    options.apiKey?.trim() || getXaiApiKeys(options.env ?? process.env)[0] || "";
  if (!apiKey && !options.fetch) {
    throw new XaiConfigError("XAI_API_KEY is not set");
  }
  return openaiCompatibleComplete({
    baseUrl: options.baseUrl?.trim() || XAI_BASE_URL,
    apiKey,
    fetch: options.fetch,
  });
}
