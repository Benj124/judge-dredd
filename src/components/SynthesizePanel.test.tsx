import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import {
  DEFAULT_SYNTHESIS_PROMPT,
  SynthesizePanel,
  type SynthesizeDocument,
  type SynthesizePanelItem,
} from "./SynthesizePanel";
import { DashboardShell } from "./DashboardShell";

const sampleDocs: SynthesizeDocument[] = [
  {
    id: "doc-1",
    slug: "blue-whale",
    title: "Blue whale",
    canonicalUrl: "https://en.wikipedia.org/wiki/Blue_whale",
    site: "en.wikipedia.org",
    charCount: 35512,
  },
  {
    id: "doc-2",
    slug: "beluga-whale",
    title: "Beluga whale",
    canonicalUrl: "https://en.wikipedia.org/wiki/Beluga_whale",
    site: "en.wikipedia.org",
    charCount: 75085,
  },
];

const samplePendingItems: SynthesizePanelItem[] = [
  {
    id: "item-pending-1",
    question: "How long is a blue whale?",
    expected_facts: ["Up to 30 metres."],
    difficulty: "easy",
    review_status: "pending",
    is_gold: false,
  },
];

test("SynthesizePanel renders document rows and an editable multi-line prompt", () => {
  const html = renderToStaticMarkup(
    createElement(SynthesizePanel, { documents: sampleDocs }),
  );

  assert.match(html, /data-testid="synthesize-panel"/);
  assert.match(html, /data-testid="synthesize-doc-list"/);
  assert.match(html, /data-testid="synthesize-doc-blue-whale"/);
  assert.match(html, /data-testid="synthesize-doc-beluga-whale"/);
  assert.match(html, /Blue whale/);
  assert.match(html, /beluga-whale/);
  assert.match(html, /data-testid="synthesize-prompt"/);
  assert.match(html, /<textarea[^>]*id="synthesis-prompt"/);
  assert.ok(
    html.includes(DEFAULT_SYNTHESIS_PROMPT.slice(0, 40)) ||
      html.includes("generating evaluation questions"),
    "prompt default text should appear in the textarea markup",
  );
  assert.match(html, /data-testid="synthesize-generate"/);
  assert.match(html, /data-testid="synthesize-run-campaign"/);
  assert.match(html, /data-testid="synthesize-mode"/);
  assert.match(html, /data-testid="synthesize-template"/);
  assert.match(html, /id="synthesis-mode"/);
  assert.match(html, /id="synthesis-template"/);
  assert.match(html, /grounded_qa/);
  assert.match(html, /retrieval_gold/);
  assert.match(html, /multi_hop/);
});

test("SynthesizePanel review and campaign controls are in the markup", () => {
  const html = renderToStaticMarkup(
    createElement(SynthesizePanel, {
      documents: sampleDocs,
      initialItems: samplePendingItems,
      initialVersionId: "version-test-1",
    }),
  );

  assert.match(html, /data-testid="synthesize-keep"/);
  assert.match(html, /data-testid="synthesize-edit"/);
  assert.match(html, /data-testid="synthesize-reject"/);
  assert.match(html, />Keep</);
  assert.match(html, />Edit</);
  assert.match(html, />Reject</);
  assert.match(html, /data-testid="synthesize-run-campaign"/);
  assert.match(html, /Run campaign from gold/);
  assert.match(html, /data-testid="synthesize-export-jsonl"/);
  assert.match(html, /data-testid="synthesize-export-csv"/);
});

test("SynthesizePanel empty state does not invent hard-coded document rows", () => {
  const html = renderToStaticMarkup(
    createElement(SynthesizePanel, { documents: [] }),
  );
  assert.match(html, /data-testid="synthesize-doc-empty"/);
  assert.doesNotMatch(html, /data-testid="synthesize-doc-blue-whale"/);
  assert.match(html, /graph:ingest-whales/);
});

test("DashboardShell registers the synthesize tab and panel slot", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardShell, {
      panels: {
        fixtures: createElement("div", null, "fixtures"),
        playground: createElement("div", null, "playground"),
        history: createElement("div", null, "history"),
        batch: createElement("div", null, "batch"),
        rubrics: createElement("div", null, "rubrics"),
        agent: createElement("div", null, "agent"),
        synthesize: createElement(SynthesizePanel, { documents: sampleDocs }),
      },
    }),
  );

  assert.match(html, /id="tab-synthesize"/);
  assert.match(html, /id="panel-synthesize"/);
  assert.match(html, /Synthesize/);
  assert.match(html, /data-testid="synthesize-panel"/);
});

test("home page wires listTextDocumentSummaries into SynthesizePanel", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/page.tsx"),
    "utf8",
  );
  assert.match(page, /listTextDocumentSummaries/);
  assert.match(page, /listSynthesisTemplates/);
  assert.match(page, /SynthesizePanel/);
  assert.match(page, /synthesize:/);
});

test("synthesize panel posts to the KEY2-backed API route", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/SynthesizePanel.tsx"),
    "utf8",
  );
  assert.match(panel, /\/api\/synthesize/);
  assert.match(panel, /\/api\/datasets\/review/);
  assert.match(panel, /\/api\/datasets\/campaign/);
  assert.match(panel, /XAI_API_KEY2/);
  const route = readFileSync(
    join(process.cwd(), "src/app/api/synthesize/route.ts"),
    "utf8",
  );
  assert.match(route, /synthesizeHttp/);
  const xai = readFileSync(join(process.cwd(), "src/lib/eval/xai.ts"), "utf8");
  assert.match(xai, /export async function xaiCompleteKey2/);
  assert.match(xai, /getXaiApiKey2/);
});
