import assert from "node:assert/strict";
import { after, test } from "node:test";
import { saveSynthesisTemplate } from "../db/synthTemplates";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { coverageVsSource } from "./synthCoverage";
import { dedupQuestions } from "./synthDedup";
import { SYNTHESIS_MODES } from "./synthModes";
import {
  parseSynthesizedQuestions,
  synthesizeQuestions,
  type SynthesizeComplete,
} from "./synthesize";
import { upsertTextDocument } from "./store";

after(async () => {
  await closePool();
});

async function seed(slug: string, title: string, fullText: string) {
  await upsertTextDocument({
    slug,
    title,
    canonicalUrl: `https://example.test/${slug}`,
    fullText,
    site: "example.test",
  });
}

async function cleanup(slugs: string[]) {
  const pool = getPool();
  for (const slug of slugs) {
    await pool.query(`DELETE FROM datasets WHERE slug = $1 OR slug LIKE $2`, [
      `synth-${slug}`,
      `%${slug}%`,
    ]);
  }
  await pool.query(`DELETE FROM text_documents WHERE slug = ANY($1::text[])`, [
    slugs,
  ]);
}

const HABITAT =
  "Habitat\n\nThe zinnium crystal only forms in deep granite caves at midnight.\n\nDiet\n\nThe hydrax protocol feeds exclusively on polar ice during winter migrations.";

function completeForMode(mode: string): SynthesizeComplete {
  return async ({ system, user }) => {
    assert.match(system, /JSON only/i);
    assert.match(user, /Produce \d+/i);
    const base = {
      difficulty: "medium" as const,
      mode,
    };
    if (mode === "multi_hop") {
      return JSON.stringify({
        questions: [
          {
            ...base,
            question: "How does zinnium cave formation relate to hydrax ice feeding?",
            expected_facts: [
              "Zinnium forms in granite caves.",
              "Hydrax feeds on polar ice.",
            ],
            source_slugs: ["mode-doc-a", "mode-doc-b"],
            difficulty: "hard",
          },
        ],
      });
    }
    if (mode === "unanswerable") {
      return JSON.stringify({
        questions: [
          {
            ...base,
            question: "In which year was zinnium first synthesized in a lab?",
            expected_facts: ["Not stated in the source."],
            unanswerable: true,
            difficulty: "easy",
          },
        ],
      });
    }
    if (mode === "adversarial_paraphrase") {
      return JSON.stringify({
        questions: [
          {
            ...base,
            question:
              "Isn't it the case that the so-called zinnium 'gem' actually nucleates only after dusk inside granite hollows?",
            expected_facts: ["The zinnium crystal only forms in deep granite caves at midnight."],
          },
        ],
      });
    }
    if (mode === "distractor_facts") {
      return JSON.stringify({
        questions: [
          {
            ...base,
            question: "Where does zinnium form?",
            expected_facts: ["The zinnium crystal only forms in deep granite caves at midnight."],
            distractors: ["Zinnium is mined from open-pit beaches at noon."],
          },
        ],
      });
    }
    if (mode === "retrieval_gold") {
      return JSON.stringify({
        questions: [
          {
            ...base,
            question: "Where does zinnium form?",
            expected_facts: ["The zinnium crystal only forms in deep granite caves at midnight."],
            expected_retrieved_context: [
              {
                doc_uri: "https://example.test/mode-doc-a",
                content: "The zinnium crystal only forms in deep granite caves at midnight.",
              },
            ],
          },
        ],
      });
    }
    return JSON.stringify({
      questions: [
        {
          ...base,
          question: "Where does zinnium form?",
          expected_facts: ["The zinnium crystal only forms in deep granite caves at midnight."],
          difficulty: "easy",
        },
        {
          ...base,
          question: "What does the hydrax protocol feed on?",
          expected_facts: ["The hydrax protocol feeds exclusively on polar ice."],
          difficulty: "hard",
        },
      ],
    });
  };
}

test("each named synthesis mode produces distinct parsed items", async () => {
  await migrate();
  const slugA = "mode-doc-a";
  const slugB = "mode-doc-b";
  await seed(slugA, "Zinnium caves", HABITAT);
  await seed(
    slugB,
    "Hydrax diet",
    "Hydrax notes\n\nThe hydrax protocol feeds exclusively on polar ice during winter migrations.",
  );
  try {
    assert.equal(SYNTHESIS_MODES.length, 6);

    const grounded = await synthesizeQuestions({
      slug: slugA,
      mode: "grounded_qa",
      nPerDoc: 2,
      difficultyMix: { easy: 1, medium: 0, hard: 1 },
      complete: completeForMode("grounded_qa"),
    });
    assert.equal(grounded.mode, "grounded_qa");
    assert.ok(grounded.questions.every((item) => item.mode === "grounded_qa"));
    assert.equal(grounded.nPerDoc, 2);
    assert.equal(grounded.difficultyMix.requested.easy, 1);
    assert.equal(grounded.difficultyMix.requested.hard, 1);
    assert.ok(grounded.difficultyMix.observed.easy + grounded.difficultyMix.observed.hard >= 1);
    assert.ok(grounded.coverage.sections.length >= 1);
    assert.equal(typeof grounded.coverage.hitCount, "number");
    assert.equal(typeof grounded.coverage.missedCount, "number");
    assert.ok(!grounded.questions.some((item) => item.unanswerable));
    assert.ok(!grounded.questions.some((item) => (item.distractors ?? []).length > 0));

    const multi = await synthesizeQuestions({
      slugs: [slugA, slugB],
      mode: "multi_hop",
      nPerDoc: 1,
      complete: completeForMode("multi_hop"),
    });
    assert.equal(multi.mode, "multi_hop");
    assert.ok(multi.questions.some((item) => (item.source_slugs ?? []).length >= 2));

    const unanswerable = await synthesizeQuestions({
      slug: slugA,
      mode: "unanswerable",
      complete: completeForMode("unanswerable"),
    });
    assert.equal(unanswerable.mode, "unanswerable");
    assert.ok(unanswerable.questions.every((item) => item.unanswerable === true));

    const paraphrase = await synthesizeQuestions({
      slug: slugA,
      mode: "adversarial_paraphrase",
      complete: completeForMode("adversarial_paraphrase"),
    });
    assert.equal(paraphrase.mode, "adversarial_paraphrase");
    assert.match(paraphrase.questions[0].question, /so-called|nucleates|hollows/i);

    const distractor = await synthesizeQuestions({
      slug: slugA,
      mode: "distractor_facts",
      complete: completeForMode("distractor_facts"),
    });
    assert.equal(distractor.mode, "distractor_facts");
    assert.ok((distractor.questions[0].distractors ?? []).length > 0);

    const retrieval = await synthesizeQuestions({
      slug: slugA,
      mode: "retrieval_gold",
      complete: completeForMode("retrieval_gold"),
    });
    assert.equal(retrieval.mode, "retrieval_gold");
    const ctx = retrieval.questions[0].expected_retrieved_context;
    assert.ok(ctx && ctx.length > 0);
    assert.ok(ctx[0].doc_uri || ctx[0].content);
  } finally {
    await cleanup([slugA, slugB]);
  }
});

test("n-per-doc, coverage vs source, and dedup are observable on shipped results", async () => {
  await migrate();
  const slug = `mix-doc-${Date.now()}`;
  await seed(slug, "Two-section briefing", HABITAT);
  try {
    const result = await synthesizeQuestions({
      slug,
      mode: "grounded_qa",
      nPerDoc: 3,
      difficultyMix: { easy: 1, medium: 1, hard: 1 },
      complete: async () =>
        JSON.stringify({
          questions: [
            {
              question: "Where does zinnium form in granite caves?",
              expected_facts: ["The zinnium crystal only forms in deep granite caves at midnight."],
              difficulty: "easy",
              mode: "grounded_qa",
            },
            {
              question: "Where does zinnium form in granite caves at midnight?",
              expected_facts: ["The zinnium crystal only forms in deep granite caves at midnight."],
              difficulty: "easy",
              mode: "grounded_qa",
            },
            {
              question: "What does hydrax feed on?",
              expected_facts: ["The hydrax protocol feeds exclusively on polar ice."],
              difficulty: "hard",
              mode: "grounded_qa",
            },
          ],
        }),
    });
    assert.equal(result.nPerDoc, 3);
    assert.deepEqual(result.difficultyMix.requested, {
      easy: 1,
      medium: 1,
      hard: 1,
    });
    if (result.droppedDuplicates.length < 1) {
      throw new Error(
        `expected dropped duplicates, kept=${JSON.stringify(result.questions.map((q) => q.question))} raw=${result.raw}`,
      );
    }
    assert.ok(result.questions.length < 3 || result.droppedDuplicates.length >= 1);
    assert.ok(result.coverage.hitCount >= 1);
    assert.ok(Array.isArray(result.coverage.missedHeadings));

    const onlyHabitat = coverageVsSource(HABITAT, [
      {
        question: "Where does zinnium form?",
        expected_facts: ["granite caves at midnight"],
      },
    ]);
    assert.ok(onlyHabitat.hitCount >= 1);
    assert.ok(onlyHabitat.missedCount >= 1);

    const dupes = dedupQuestions([
      { question: "Where does zinnium form in granite caves?", expected_facts: [] },
      { question: "Where does zinnium form inside granite caves?", expected_facts: [] },
    ]);
    assert.equal(dupes.kept.length, 1);
    assert.equal(dupes.dropped.length, 1);
  } finally {
    await cleanup([slug]);
  }
});

test("versioned prompt template persists and is used by synthesize", async () => {
  await migrate();
  const slug = `tmpl-doc-${Date.now()}`;
  await seed(slug, "Template whale", "The unit whale glows blue at dusk in template tests.");
  const template = await saveSynthesisTemplate({
    id: `custom-grounded-${Date.now()}`,
    version: "2",
    mode: "grounded_qa",
    name: "Custom grounded v2",
    body: "CUSTOM_TEMPLATE_MARKER {{title}}\n{{full_text}}\nProduce {{n}} questions. Mix {{difficulty_mix}}.",
  });
  try {
    let sawBody = "";
    const result = await synthesizeQuestions({
      slug,
      templateId: template.id,
      templateVersion: template.version,
      nPerDoc: 1,
      complete: async ({ user }) => {
        sawBody = user;
        return JSON.stringify({
          questions: [
            {
              question: "When does the unit whale glow?",
              expected_facts: ["It glows blue at dusk."],
              difficulty: "easy",
              mode: "grounded_qa",
            },
          ],
        });
      },
    });
    assert.match(sawBody, /CUSTOM_TEMPLATE_MARKER/);
    assert.match(sawBody, /Template whale/);
    assert.equal(result.templateId, template.id);
    assert.equal(result.templateVersion, "2");
    assert.equal(result.mode, "grounded_qa");
    assert.equal(result.questions.length, 1);
  } finally {
    await getPool().query(
      `DELETE FROM synthesis_templates WHERE id = $1 AND version = $2`,
      [template.id, template.version],
    );
    await cleanup([slug]);
  }
});

test("parseSynthesizedQuestions reads retrieval gold and distractors", () => {
  const parsed = parseSynthesizedQuestions(
    JSON.stringify({
      questions: [
        {
          question: "Where?",
          expected_facts: ["true"],
          distractors: ["false"],
          mode: "retrieval_gold",
          expected_retrieved_context: [
            { doc_uri: "https://example.test/a", content: "span" },
          ],
        },
      ],
    }),
  );
  assert.equal(parsed[0].mode, "retrieval_gold");
  assert.deepEqual(parsed[0].distractors, ["false"]);
  assert.equal(parsed[0].expected_retrieved_context?.[0].content, "span");
});
