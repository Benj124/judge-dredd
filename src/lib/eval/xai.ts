import type { JudgeComplete } from "./types";

export const XAI_BASE_URL = "https://api.x.ai/v1";

export class XaiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XaiConfigError";
  }
}

export const xaiComplete: JudgeComplete = async ({ system, user, model }) => {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new XaiConfigError("XAI_API_KEY is not set");
  }

  const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
};
