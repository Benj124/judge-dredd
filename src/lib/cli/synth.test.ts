import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { listGoldItems } from "../db/datasetObject";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { stubComplete } from "../eval/complete";
import { dispatchSynth } from "./synth";

after(async () => {
  await closePool();
});

test("synth CLI ingest → generate → review → run → export JSONL (injected stubs)", async () => {
  await migrate();
  const chunks: string[] = [];
  const stdout = (text: string) => {
    chunks.push(text);
  };
  const ingest = await dispatchSynth(
    ["ingest", "--file", "src/lib/graph/fixtures/corpus-note.md"],
    { stdout, migrate },
  );
  assert.equal(ingest.command, "ingest");
  const ingestPayload = ingest.payload as { slug: string };
  assert.equal(ingestPayload.slug, "corpus-note");
  assert.match(chunks.join(""), /corpus-note/);

  const generate = await dispatchSynth(
    ["generate", "--slug", "corpus-note", "--n", "3", "--keep"],
    {
      stdout,
      migrate,
      complete: async () =>
        JSON.stringify({
          questions: [
            {
              question: "What glows at midnight in the briefing?",
              expected_facts: ["The zinnium crystal glows at midnight."],
              difficulty: "easy",
            },
            {
              question: "Which protocol feeds on polar ice in winter?",
              expected_facts: ["The hydrax protocol feeds on polar ice."],
              difficulty: "medium",
            },
            {
              question: "Where does granite cave nucleation occur?",
              expected_facts: ["Deep granite caves."],
              difficulty: "hard",
            },
          ],
        }),
    },
  );
  const gen = generate.payload as {
    versionId: string;
    slug: string;
    questions: number;
    kept: boolean;
  };
  assert.equal(generate.command, "generate");
  assert.ok(gen.versionId);
  assert.equal(gen.slug, "corpus-note");
  assert.equal(gen.questions, 3);
  assert.equal(gen.kept, true);

  const gold = await listGoldItems(gen.versionId);
  assert.equal(gold.length, 3);

  const run = await dispatchSynth(["run", "--versionId", gen.versionId], {
    stdout,
    migrate,
    judge: stubComplete,
    generate: async ({ context }) => `Stub generated answer to: ${context}`,
  });
  assert.equal(run.command, "run");
  assert.equal((run.payload as { datasetVersion: string }).datasetVersion, gen.versionId);
  assert.ok((run.payload as { campaignId: string }).campaignId);

  const exported = await dispatchSynth(
    ["export", "--versionId", gen.versionId, "--format", "jsonl"],
    { stdout, migrate },
  );
  assert.equal(exported.command, "export");
  assert.equal((exported.payload as { jsonl: boolean }).jsonl, true);
  const printed = chunks.join("");
  assert.match(printed, /"context":/);
  assert.match(printed, /zinnium/i);

  await getPool().query(`DELETE FROM datasets WHERE slug = $1`, [
    "synth-corpus-note",
  ]);
  await getPool().query(`DELETE FROM text_documents WHERE slug = $1`, [
    "corpus-note",
  ]);
});

test("EVAL_LLM_STUB generate --n 5 keeps five questions after dedup", async () => {
  await migrate();
  const prev = process.env.EVAL_LLM_STUB;
  process.env.EVAL_LLM_STUB = "1";
  const slug = "stub-dedup-whale";
  try {
    await dispatchSynth([
      "ingest",
      "--title",
      "Stub Dedup Whale",
      "--body",
      "Blue whales eat krill and live in every ocean.",
      "--slug",
      slug,
    ]);
    const generate = await dispatchSynth([
      "generate",
      "--slug",
      slug,
      "--n",
      "5",
      "--keep",
    ]);
    const gen = generate.payload as {
      questions: number;
      droppedDuplicates: number;
      kept: boolean;
    };
    assert.equal(gen.questions, 5);
    assert.equal(gen.droppedDuplicates, 0);
    assert.equal(gen.kept, true);
  } finally {
    if (prev === undefined) delete process.env.EVAL_LLM_STUB;
    else process.env.EVAL_LLM_STUB = prev;
    await getPool().query(`DELETE FROM datasets WHERE slug = $1`, [
      `synth-${slug}`,
    ]);
    await getPool().query(`DELETE FROM text_documents WHERE slug = $1`, [slug]);
  }
});

test("dispatchSynth pairwise returns A/B/tie without a database", async () => {
  const cases: Array<{ preference: "A" | "B" | "tie"; rationale: string }> = [
    { preference: "A", rationale: "A is factually correct." },
    { preference: "B", rationale: "B is the better answer." },
    { preference: "tie", rationale: "Both answers are equivalent." },
  ];
  for (const expected of cases) {
    const chunks: string[] = [];
    const result = await dispatchSynth(
      [
        "pairwise",
        "--a",
        "Paris is the capital of France.",
        "--b",
        "Lyon is the capital of France.",
        "--context",
        "What is the capital of France?",
      ],
      {
        migrate: async () => {
          throw new Error("pairwise must not require migrate");
        },
        judge: async () =>
          JSON.stringify({
            preference: expected.preference,
            rationale: expected.rationale,
          }),
        stdout: (text) => chunks.push(text),
      },
    );
    assert.equal(result.command, "pairwise");
    const payload = result.payload as { preference: string; rationale: string };
    assert.equal(payload.preference, expected.preference);
    assert.equal(payload.rationale, expected.rationale);
    assert.match(
      chunks.join(""),
      new RegExp(`"preference": "${expected.preference}"`),
    );
  }
});

test("npx judge-dredd help prints Usage; ingest prints a slug", () => {
  const help = spawnSync("npx", ["judge-dredd", "help"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, EVAL_LLM_STUB: "1", RAG_EMBED_STUB: "1" },
  });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /Usage: npx judge-dredd/);
  assert.match(help.stdout, /ingest/);
  assert.match(help.stdout, /generate/);
  assert.match(help.stdout, /--n/);
  assert.match(help.stdout, /--keep/);
  assert.match(help.stdout, /export/);
  assert.match(help.stdout, /jsonl/);
  assert.match(help.stdout, /pairwise/);
  assert.match(help.stdout, /gcp-data-store/);
  assert.match(help.stdout, /databricks-index/);
  assert.match(help.stdout, /service-account/);

  const ingest = spawnSync(
    "npx",
    [
      "judge-dredd",
      "ingest",
      "--file",
      "src/lib/graph/fixtures/corpus-note.md",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EVAL_LLM_STUB: "1", RAG_EMBED_STUB: "1" },
    },
  );
  assert.equal(ingest.status, 0, ingest.stderr || ingest.stdout);
  assert.match(ingest.stdout, /corpus-note/);
  assert.match(ingest.stdout, /"command": "ingest"/);
});

test("fork hygiene: MIT license, public package, no CFA dump", () => {
  const root = process.cwd();
  const license = readFileSync(join(root, "LICENSE"), "utf8");
  assert.match(license, /MIT License/);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    private: boolean;
    license: string;
    bin?: { synth?: string; synthkit?: string; "judge-dredd"?: string };
    repository?: { url?: string };
    dependencies?: { tsx?: string };
  };
  assert.equal(pkg.private, false);
  assert.equal(pkg.name, "judge-dredd");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.bin?.synth, "bin/synth");
  assert.equal(pkg.bin?.synthkit, "bin/synth");
  assert.equal(pkg.bin?.["judge-dredd"], "bin/synth");
  assert.match(pkg.repository?.url ?? "", /github\.com\/Benj124\/judge-dredd/);
  assert.ok(pkg.dependencies?.tsx, "tsx must be a runtime dependency for npx synth");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(envExample, /XAI_API_KEY=/);
  assert.match(envExample, /XAI_API_KEY2/);
  assert.match(envExample, /EVAL_LLM_STUB/);
  assert.match(envExample, /RAG_EMBED_STUB/);
  assert.equal(
    existsSync(join(root, "cfa_home_us_staff_human_curated_eval_set_1786626706.634225.json")),
    false,
  );
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /judge-dredd ingest/);
  assert.match(readme, /judge-dredd generate/);
  assert.match(readme, /judge-dredd run/);
  assert.match(readme, /judge-dredd export/);
  assert.match(readme, /npx judge-dredd help/);
  assert.match(readme, /jsonl/i);
  assert.match(readme, /docker compose up/);
  assert.match(readme, /demo/i);
  assert.match(readme, /^# synthkit/m);
  assert.match(readme, /npm i synthkit/);
  assert.doesNotMatch(readme, /^# Judge Dredd/m);
  assert.doesNotMatch(readme, /internal evaluation/i);
  assert.match(readme, /\[!\[test\]/);
  assert.ok(existsSync(join(root, "CONTRIBUTING.md")));
  assert.ok(existsSync(join(root, ".github/workflows/test.yml")));
  const ci = readFileSync(join(root, ".github/workflows/test.yml"), "utf8");
  assert.match(ci, /pgvector/);
  assert.match(ci, /npm test/);
  const history = spawnSync(
    "git",
    [
      "log",
      "HEAD",
      "--pretty=format:",
      "--name-only",
      "--",
      "cfa_home_us_staff_human_curated_eval_set_1786626706.634225.json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(
    (history.stdout || "").trim(),
    "",
    "HEAD history must not contain the private CFA dump",
  );
});
