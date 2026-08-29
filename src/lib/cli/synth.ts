#!/usr/bin/env npx tsx
import { writeFileSync } from "node:fs";
import { migrate } from "../db/migrate";
import {
  listGoldItems,
  listVersionItems,
  reviewDatasetItem,
} from "../db/datasetObject";
import { closePool } from "../db/pool";
import { getJudgeComplete, stubComplete } from "../eval/complete";
import { runGoldDatasetCampaign } from "../eval/datasetCampaign";
import { exportGoldVersion } from "../eval/datasetIo";
import { DEFAULT_GENERATE_MODEL, generateJudgedText } from "../eval/generate";
import { comparePairwise } from "../eval/pairwise";
import type { JudgeComplete } from "../eval/types";
import {
  ingestDatabricksIndex,
  ingestGcpDataStore,
} from "../connectors/ingest";
import type { ConnectorFetch } from "../connectors/types";
import { ingestLocalFile, ingestPaste, ingestUrl } from "../graph/corpus";
import {
  synthesizeAndPersist,
  type SynthesizeComplete,
} from "../graph/synthesize";

export type SynthCliDeps = {
  complete?: SynthesizeComplete;
  judge?: JudgeComplete;
  generate?: (job: { context?: string; subject: string }) => Promise<string>;
  stdout?: (text: string) => void;
  migrate?: () => Promise<void>;
  fetch?: ConnectorFetch;
};

function argValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function stubSynthComplete(slug: string): SynthesizeComplete {
  // Wording must stay below the Jaccard dedup threshold (~0.55).
  const stubs = [
    {
      question: `Where does ${slug} live according to the document?`,
      expected_facts: [`Habitat for ${slug} is stated in the source.`],
    },
    {
      question: `What does ${slug} eat in the source text?`,
      expected_facts: [`Diet for ${slug} is stated in the source.`],
    },
    {
      question: `How is ${slug} conservation described?`,
      expected_facts: [`Conservation status for ${slug} is stated in the source.`],
    },
    {
      question: `Which scientific name does the ${slug} article use?`,
      expected_facts: [`The scientific name for ${slug} is stated in the source.`],
    },
    {
      question: `How long is a typical ${slug} in the notes?`,
      expected_facts: [`A length measurement for ${slug} is stated in the source.`],
    },
  ];
  return async () =>
    JSON.stringify({
      questions: stubs.map((row, i) => ({
        ...row,
        difficulty: i % 2 === 0 ? "easy" : "medium",
        mode: "grounded_qa",
      })),
    });
}

export async function dispatchSynth(
  argv: string[],
  deps: SynthCliDeps = {},
): Promise<{ ok: true; command: string; payload: unknown }> {
  const args = argv[0] === "synth" ? argv.slice(1) : argv;
  const command = args[0]?.trim() || "";
  const rest = args.slice(1);
  const out = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const doMigrate = deps.migrate ?? migrate;

  if (!command || command === "help" || command === "--help") {
    const help =
      "Usage: synth ingest|generate|run|export|review|pairwise [...flags]\n" +
      "  ingest    --file PATH | --url URL | --title T --body B\n" +
      "            --gcp-data-store RESOURCE [--token T | --service-account JSON|PATH]\n" +
      "            --databricks-index NAME --host URL [--token PAT | --client-id ID --client-secret S]\n" +
      "            [--query TEXT] [--text-column COL] [--title-column COL]\n" +
      "  generate  --slug SLUG [--n 5] [--keep]\n" +
      "  review    --itemId ID [--action keep|edit|reject] | --versionId ID --keep-all\n" +
      "  run       --versionId ID\n" +
      "  export    --versionId ID [--format jsonl|csv] [--out PATH]\n" +
      "  pairwise  --a TEXT --b TEXT [--context TEXT]\n";
    out(help);
    return { ok: true, command: "help", payload: { help } };
  }

  const needsDb = command !== "pairwise" && command !== "compare";
  if (needsDb) {
    await doMigrate();
  }

  if (command === "ingest") {
    const file = argValue(rest, "--file");
    const url = argValue(rest, "--url");
    const title = argValue(rest, "--title");
    const body = argValue(rest, "--body");
    const slug = argValue(rest, "--slug");
    const gcpStore = argValue(rest, "--gcp-data-store");
    const databricksIndex = argValue(rest, "--databricks-index");
    const host = argValue(rest, "--host") ?? process.env.DATABRICKS_HOST;
    const flagToken = argValue(rest, "--token");
    const serviceAccount =
      argValue(rest, "--service-account") ??
      process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const clientId =
      argValue(rest, "--client-id") ?? process.env.DATABRICKS_CLIENT_ID;
    const clientSecret =
      argValue(rest, "--client-secret") ?? process.env.DATABRICKS_CLIENT_SECRET;
    const query = argValue(rest, "--query");
    const textColumn = argValue(rest, "--text-column");
    const titleColumn = argValue(rest, "--title-column");
    if (gcpStore) {
      const result = await ingestGcpDataStore({
        dataStore: gcpStore,
        accessToken: flagToken ?? process.env.GCP_ACCESS_TOKEN,
        serviceAccount,
        fetch: deps.fetch,
      });
      const payload = {
        command: "ingest",
        source: result.source,
        slugs: result.documents.map((doc) => doc.slug),
        documents: result.documents.map((doc) => ({
          slug: doc.slug,
          title: doc.title,
          chars: doc.fullText.length,
        })),
      };
      out(JSON.stringify(payload, null, 2) + "\n");
      return { ok: true, command: "ingest", payload };
    }
    if (databricksIndex) {
      if (!host) {
        throw new Error("synth ingest --databricks-index requires --host or DATABRICKS_HOST");
      }
      const result = await ingestDatabricksIndex({
        host,
        index: databricksIndex,
        token: flagToken ?? process.env.DATABRICKS_TOKEN,
        clientId,
        clientSecret,
        query,
        textColumn,
        titleColumn,
        fetch: deps.fetch,
      });
      const payload = {
        command: "ingest",
        source: result.source,
        slugs: result.documents.map((doc) => doc.slug),
        documents: result.documents.map((doc) => ({
          slug: doc.slug,
          title: doc.title,
          chars: doc.fullText.length,
        })),
      };
      out(JSON.stringify(payload, null, 2) + "\n");
      return { ok: true, command: "ingest", payload };
    }
    if (file) {
      const doc = await ingestLocalFile(file);
      const payload = {
        command: "ingest",
        slug: doc.slug,
        title: doc.title,
        url: doc.canonicalUrl,
        chars: doc.fullText.length,
      };
      out(JSON.stringify(payload, null, 2) + "\n");
      return { ok: true, command: "ingest", payload };
    }
    if (url) {
      const doc = await ingestUrl(url);
      const payload = {
        command: "ingest",
        slug: doc.slug,
        title: doc.title,
        url: doc.canonicalUrl,
      };
      out(JSON.stringify(payload, null, 2) + "\n");
      return { ok: true, command: "ingest", payload };
    }
    if (title && body) {
      const doc = await ingestPaste({ title, body, slug });
      const payload = { command: "ingest", slug: doc.slug, title: doc.title };
      out(JSON.stringify(payload, null, 2) + "\n");
      return { ok: true, command: "ingest", payload };
    }
    throw new Error(
      "synth ingest requires --file, --url, --title and --body, --gcp-data-store, or --databricks-index",
    );
  }

  if (command === "generate") {
    const slug = argValue(rest, "--slug")?.trim();
    if (!slug) throw new Error("synth generate requires --slug");
    const n = Number(argValue(rest, "--n") ?? "5");
    const complete =
      deps.complete ??
      (process.env.EVAL_LLM_STUB === "1" ? stubSynthComplete(slug) : undefined);
    const result = await synthesizeAndPersist({
      slug,
      nPerDoc: Number.isFinite(n) && n > 0 ? n : 5,
      mode: "grounded_qa",
      complete,
    });
    if (hasFlag(rest, "--keep")) {
      for (const item of result.items) {
        await reviewDatasetItem({ itemId: item.id, action: "keep" });
      }
    }
    const payload = {
      command: "generate",
      slug: result.slug,
      versionId: result.versionId,
      questions: result.questions.length,
      droppedDuplicates: result.droppedDuplicates.length,
      kept: hasFlag(rest, "--keep"),
    };
    out(JSON.stringify(payload, null, 2) + "\n");
    return { ok: true, command: "generate", payload };
  }

  if (command === "review") {
    const itemId = argValue(rest, "--itemId")?.trim();
    const versionId = argValue(rest, "--versionId")?.trim();
    const actionRaw = (argValue(rest, "--action") ?? "keep").trim();
    if (actionRaw !== "keep" && actionRaw !== "edit" && actionRaw !== "reject") {
      throw new Error("synth review --action must be keep, edit, or reject");
    }
    if (hasFlag(rest, "--keep-all")) {
      if (!versionId) throw new Error("synth review --keep-all requires --versionId");
      const items = await listVersionItems(versionId);
      const kept = [];
      for (const item of items) {
        kept.push(await reviewDatasetItem({ itemId: item.id, action: "keep" }));
      }
      const payload = { command: "review", versionId, kept: kept.length };
      out(JSON.stringify(payload, null, 2) + "\n");
      return { ok: true, command: "review", payload };
    }
    if (!itemId) throw new Error("synth review requires --itemId or --keep-all");
    const item = await reviewDatasetItem({
      itemId,
      action: actionRaw,
    });
    const payload = {
      command: "review",
      itemId: item.id,
      action: actionRaw,
      is_gold: item.isGold,
    };
    out(JSON.stringify(payload, null, 2) + "\n");
    return { ok: true, command: "review", payload };
  }

  if (command === "run") {
    const versionId = argValue(rest, "--versionId")?.trim();
    if (!versionId) throw new Error("synth run requires --versionId");
    const judge =
      deps.judge ??
      (process.env.EVAL_LLM_STUB === "1" ? stubComplete : getJudgeComplete());
    const generate =
      deps.generate ??
      (async (job: { context?: string; subject: string }) => {
        if (process.env.EVAL_LLM_STUB === "1") {
          return `Stub generated answer to: ${job.context?.trim() || job.subject}`;
        }
        return generateJudgedText(job, judge, DEFAULT_GENERATE_MODEL);
      });
    const campaign = await runGoldDatasetCampaign({
      versionId,
      complete: judge,
      generate,
    });
    const payload = {
      command: "run",
      campaignId: campaign.campaignId,
      datasetVersion: campaign.datasetVersion,
      runs: campaign.runs.length,
    };
    out(JSON.stringify(payload, null, 2) + "\n");
    return { ok: true, command: "run", payload };
  }

  if (command === "export") {
    const versionId = argValue(rest, "--versionId")?.trim();
    if (!versionId) throw new Error("synth export requires --versionId");
    const format = (argValue(rest, "--format") ?? "jsonl").trim();
    if (format !== "jsonl" && format !== "csv") {
      throw new Error("synth export --format must be jsonl or csv");
    }
    const gold = await listGoldItems(versionId);
    if (gold.length === 0) {
      throw new Error(`No gold items on version "${versionId}"`);
    }
    const exported = await exportGoldVersion(versionId, format);
    const outPath = argValue(rest, "--out");
    if (outPath) {
      writeFileSync(outPath, exported.body, "utf8");
    }
    out(exported.body);
    if (!exported.body.includes("\n") && format === "jsonl") {
      out("\n");
    }
    const payload = {
      command: "export",
      versionId,
      format,
      filename: exported.filename,
      rows: gold.length,
      jsonl: format === "jsonl",
    };
    return { ok: true, command: "export", payload };
  }

  if (command === "pairwise" || command === "compare") {
    const a = argValue(rest, "--a")?.trim();
    const b = argValue(rest, "--b")?.trim();
    const context = argValue(rest, "--context")?.trim();
    if (!a || !b) {
      throw new Error("synth pairwise requires --a and --b");
    }
    const judge =
      deps.judge ??
      (process.env.EVAL_LLM_STUB === "1"
        ? async () =>
            JSON.stringify({
              preference: "A",
              rationale: "Stub pairwise: A preferred.",
            })
        : getJudgeComplete());
    const result = await comparePairwise({
      a,
      b,
      context,
      complete: judge,
    });
    const payload = {
      command: "pairwise",
      preference: result.preference,
      rationale: result.rationale,
      model: result.model,
    };
    out(JSON.stringify(payload, null, 2) + "\n");
    return { ok: true, command: "pairwise", payload };
  }

  throw new Error(`Unknown synth command "${command}"`);
}

async function main() {
  try {
    await dispatchSynth(process.argv.slice(2));
  } finally {
    await closePool();
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("synth.ts") || entry.endsWith("synth.js")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
