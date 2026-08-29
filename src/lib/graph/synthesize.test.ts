import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { getXaiApiKey2 } from "../eval/xai";
import {
  fillSynthesisPrompt,
  parseSynthesizedQuestions,
  synthesizeQuestionsFromDocument,
} from "./synthesize";
import { synthesizeHttp } from "./synthesizeHttp";
import { upsertTextDocument } from "./store";

after(async () => {
  await closePool();
});

test("fillSynthesisPrompt substitutes title, url, and full_text", () => {
  const filled = fillSynthesisPrompt(
    "T={{title}} U={{url}}\n{{full_text}}",
    {
      title: "Blue whale",
      canonicalUrl: "https://en.wikipedia.org/wiki/Blue_whale",
      fullText: "Largest animal.",
    },
  );
  assert.equal(
    filled,
    "T=Blue whale U=https://en.wikipedia.org/wiki/Blue_whale\nLargest animal.",
  );
});

test("parseSynthesizedQuestions accepts fenced JSON and question arrays", () => {
  const parsed = parseSynthesizedQuestions(`\`\`\`json
{"questions":[{"question":"How large?","expected_facts":["Up to 30m"],"difficulty":"easy"}]}
\`\`\``);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].question, "How large?");
  assert.deepEqual(parsed[0].expected_facts, ["Up to 30m"]);
  assert.equal(parsed[0].difficulty, "easy");
});

test("getXaiApiKey2 reads only the second key", () => {
  assert.equal(
    getXaiApiKey2({ XAI_API_KEY: "first", XAI_API_KEY2: " second " }),
    "second",
  );
  assert.equal(getXaiApiKey2({ XAI_API_KEY: "first" }), undefined);
});

test("synthesizeQuestionsFromDocument uses injected complete (KEY2 path shape)", async () => {
  await migrate();
  const slug = `synth-unit-${Date.now()}`;
  await upsertTextDocument({
    slug,
    title: "Unit whale",
    canonicalUrl: `https://en.wikipedia.org/wiki/Test_${slug}`,
    fullText:
      "The unit whale is a fictional species used only in synthesize unit tests. It glows blue at dusk.",
  });

  let sawKey2Shape = false;
  const result = await synthesizeQuestionsFromDocument({
    slug,
    promptTemplate:
      "Title {{title}} URL {{url}}\nText:\n{{full_text}}\nReturn JSON questions.",
    model: "test-synth-model",
    complete: async ({ system, user, model }) => {
      sawKey2Shape = true;
      assert.match(system, /synthesize grounded/i);
      assert.match(user, /Unit whale/);
      assert.match(user, /glows blue at dusk/);
      assert.equal(model, "test-synth-model");
      return JSON.stringify({
        questions: [
          {
            question: "When does the unit whale glow?",
            expected_facts: ["It glows blue at dusk."],
            difficulty: "easy",
          },
        ],
      });
    },
  });

  assert.ok(sawKey2Shape);
  assert.equal(result.slug, slug);
  assert.equal(result.questions.length, 1);
  assert.match(result.questions[0].question, /glow/i);
  assert.equal(result.model, "test-synth-model");

  await getPool().query(`DELETE FROM text_documents WHERE slug = $1`, [slug]);
});

test("synthesizeHttp precheck and success with stub complete", async () => {
  await migrate();
  const slug = `synth-http-${Date.now()}`;
  await upsertTextDocument({
    slug,
    title: "HTTP whale",
    canonicalUrl: `https://en.wikipedia.org/wiki/Test_${slug}`,
    fullText: "HTTP whale articles exist only for API path tests.",
  });

  const bad = await synthesizeHttp(
    new Request("http://localhost/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    }),
  );
  assert.equal(bad.status, 400);
  const badBody = (await bad.json()) as { ok: boolean; error: string };
  assert.equal(badBody.ok, false);
  assert.match(badBody.error, /slug/i);

  const ok = await synthesizeHttp(
    new Request("http://localhost/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        prompt: "Make one question from {{title}}: {{full_text}}",
      }),
    }),
    {
      complete: async () =>
        JSON.stringify({
          questions: [
            {
              question: "What is an HTTP whale?",
              expected_facts: ["Used for API path tests."],
            },
          ],
        }),
    },
  );
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as {
    ok: boolean;
    questions: Array<{ question: string }>;
    slug: string;
    versionId: string;
    items: Array<{ is_gold: boolean; review_status: string; source_slug: string }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.slug, slug);
  assert.equal(body.questions.length, 1);
  assert.match(body.questions[0].question, /HTTP whale/i);
  assert.ok(body.versionId);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].is_gold, false);
  assert.equal(body.items[0].review_status, "pending");
  assert.equal(body.items[0].source_slug, slug);

  await getPool().query(`DELETE FROM datasets WHERE slug = $1`, [`synth-${slug}`]);
  await getPool().query(`DELETE FROM text_documents WHERE slug = $1`, [slug]);
});
