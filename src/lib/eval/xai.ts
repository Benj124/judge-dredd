import { extractSseDelta } from "./stream";
import type { JudgeComplete } from "./types";

export const XAI_BASE_URL = "https://api.x.ai/v1";

export class XaiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XaiConfigError";
  }
}

export function getXaiApiKeys(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const keys = [env.XAI_API_KEY, env.XAI_API_KEY2]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(keys)];
}

/** Second xAI key — reserved for synthesis / secondary agent paths. */
export function getXaiApiKey2(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const key = env.XAI_API_KEY2?.trim();
  return key || undefined;
}

const FALLBACK_MODELS = [
  "grok-4.20-0309-non-reasoning",
  "grok-4.3",
  "grok-4.20-0309-reasoning",
];

async function completeOnce(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  timeoutMs = 45_000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
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
        `xAI request failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("xAI response missing message content");
    }
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `xAI request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type StreamCompleteResult = {
  text: string;
  ttftMs: number;
  totalMs: number;
  model: string;
};

async function streamOnce(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<StreamCompleteResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `xAI request failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    if (!response.body) {
      throw new Error("xAI stream missing body");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let ttftMs: number | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const piece = extractSseDelta(line);
        if (!piece) continue;
        if (ttftMs === null) ttftMs = Date.now() - started;
        text += piece;
      }
    }
    if (ttftMs === null) ttftMs = Date.now() - started;
    if (!text.trim()) {
      throw new Error("xAI stream returned empty text");
    }
    return { text: text.trim(), ttftMs, totalMs: Date.now() - started, model };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("xAI request timed out after 45s");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function xaiStreamComplete(input: {
  system: string;
  user: string;
  model: string;
}): Promise<StreamCompleteResult> {
  const apiKeys = getXaiApiKeys();
  if (apiKeys.length === 0) {
    throw new XaiConfigError("XAI_API_KEY is not set");
  }
  const models = [
    input.model,
    ...FALLBACK_MODELS.filter((item) => item !== input.model),
  ];
  let lastError: Error | undefined;
  for (const apiKey of apiKeys) {
    for (const candidate of models) {
      try {
        return await streamOnce(apiKey, candidate, input.system, input.user);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const badKey = /Incorrect API key|invalid api key|Unauthorized/i.test(
          lastError.message,
        );
        if (badKey) break;
        const retryable = /failed \((429|5\d\d)\)|timed out|404/.test(
          lastError.message,
        );
        if (!retryable) throw lastError;
      }
    }
  }
  if (lastError && /Incorrect API key|invalid api key/i.test(lastError.message)) {
    throw new XaiConfigError(
      "Incorrect xAI API key. Update XAI_API_KEY (or XAI_API_KEY2) in .env from https://console.x.ai",
    );
  }
  throw lastError ?? new Error("Generate stream failed");
}

export const xaiComplete: JudgeComplete = async ({ system, user, model }) => {
  const apiKeys = getXaiApiKeys();
  if (apiKeys.length === 0) {
    throw new XaiConfigError("XAI_API_KEY is not set");
  }

  const models = [model, ...FALLBACK_MODELS.filter((item) => item !== model)];
  let lastError: Error | undefined;
  for (const apiKey of apiKeys) {
    for (const candidate of models) {
      try {
        return await completeOnce(apiKey, candidate, system, user);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const badKey = /Incorrect API key|invalid api key|Unauthorized/i.test(
          lastError.message,
        );
        if (badKey) break;
        const retryable = /failed \((429|5\d\d)\)|timed out|404/.test(
          lastError.message,
        );
        if (!retryable) throw lastError;
      }
    }
  }
  if (lastError && /Incorrect API key|invalid api key/i.test(lastError.message)) {
    throw new XaiConfigError(
      "Incorrect xAI API key. Update XAI_API_KEY (or XAI_API_KEY2) in .env from https://console.x.ai",
    );
  }
  throw lastError ?? new Error("Judge call failed");
};

/**
 * Chat completion using only XAI_API_KEY2 (synthesis agent).
 * Does not fall back to XAI_API_KEY.
 */
export async function xaiCompleteKey2(input: {
  system: string;
  user: string;
  model: string;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = getXaiApiKey2();
  if (!apiKey) {
    throw new XaiConfigError(
      "XAI_API_KEY2 is not set. Add the second key to .env for question synthesis.",
    );
  }

  const models = [
    input.model,
    ...FALLBACK_MODELS.filter((item) => item !== input.model),
  ];
  const timeoutMs = input.timeoutMs ?? 120_000;
  let lastError: Error | undefined;
  for (const candidate of models) {
    try {
      return await completeOnce(
        apiKey,
        candidate,
        input.system,
        input.user,
        timeoutMs,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const badKey = /Incorrect API key|invalid api key|Unauthorized/i.test(
        lastError.message,
      );
      if (badKey) {
        throw new XaiConfigError(
          "Incorrect XAI_API_KEY2. Update the second key in .env from https://console.x.ai",
        );
      }
      const retryable = /failed \((429|5\d\d)\)|timed out|404/.test(
        lastError.message,
      );
      if (!retryable) throw lastError;
    }
  }
  throw lastError ?? new Error("Synthesis call failed");
}
