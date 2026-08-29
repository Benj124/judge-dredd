"use client";

import { useMemo, useState } from "react";
import type { TextDocumentSummary } from "@/lib/graph/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BUILTIN_SYNTHESIS_TEMPLATES,
  DEFAULT_N_PER_DOC,
  SYNTHESIS_MODES,
  type SynthesisMode,
  type SynthesisTemplate,
} from "@/lib/graph/synthModes";

export type SynthesizeDocument = Pick<
  TextDocumentSummary,
  "id" | "slug" | "title" | "canonicalUrl" | "site" | "charCount"
>;

export type SynthesizedQuestionView = {
  id?: string;
  question: string;
  expected_facts: string[];
  difficulty?: string;
  review_status?: "pending" | "kept" | "edited" | "rejected";
  is_gold?: boolean;
};

export type SynthesizePanelItem = {
  id: string;
  question: string;
  expected_facts: string[];
  difficulty?: string | null;
  review_status: "pending" | "kept" | "edited" | "rejected";
  is_gold: boolean;
};

export const DEFAULT_SYNTHESIS_PROMPT = `You are generating evaluation questions for an LLM judge.

Article title: {{title}}
Source URL: {{url}}

Article full text:
{{full_text}}

Produce 5 grounded questions. For each question include:
- question: user-facing question text
- expected_facts: short bullets supportable only by the article
- difficulty: easy | medium | hard

Only use facts present in the article. Reply with JSON only:
{"questions":[{"question":"...","expected_facts":["..."],"difficulty":"medium"}]}`;

function formatCharCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k chars`;
  return `${n} chars`;
}

type SynthesizeApiResponse =
  | {
      ok: true;
      slug: string;
      title: string;
      model: string;
      questions: SynthesizedQuestionView[];
      versionId?: string;
      datasetId?: string;
      promptHash?: string;
      items?: SynthesizePanelItem[];
    }
  | { ok: false; error: string; code?: string };

type ReviewApiResponse =
  | { ok: true; item: SynthesizePanelItem }
  | { ok: false; error: string };

type CampaignApiResponse =
  | {
      ok: true;
      campaignId: string;
      table: Array<{
        fixtureId: string;
        overall: number | null;
        passed: boolean | null;
        error: string | null;
      }>;
    }
  | { ok: false; error: string };

function itemsFromResponse(data: Extract<SynthesizeApiResponse, { ok: true }>): SynthesizePanelItem[] {
  if (Array.isArray(data.items) && data.items.length > 0) {
    return data.items.map((item) => ({
      id: item.id,
      question: item.question,
      expected_facts: item.expected_facts ?? [],
      difficulty: item.difficulty,
      review_status: item.review_status ?? "pending",
      is_gold: item.is_gold === true,
    }));
  }
  return (data.questions ?? []).map((question, index) => ({
    id: question.id ?? `local-${index}`,
    question: question.question,
    expected_facts: question.expected_facts ?? [],
    difficulty: question.difficulty,
    review_status: question.review_status ?? "pending",
    is_gold: question.is_gold === true,
  }));
}

export function SynthesizePanel({
  documents,
  initialItems = [],
  initialVersionId = null,
  templates = BUILTIN_SYNTHESIS_TEMPLATES,
}: {
  documents: SynthesizeDocument[];
  initialItems?: SynthesizePanelItem[];
  initialVersionId?: string | null;
  templates?: SynthesisTemplate[];
}) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    documents[0]?.slug ?? null,
  );
  const [extraSlugs, setExtraSlugs] = useState<string[]>([]);
  const [mode, setMode] = useState<SynthesisMode>("grounded_qa");
  const [templateKey, setTemplateKey] = useState("grounded-qa@1");
  const [nPerDoc, setNPerDoc] = useState(DEFAULT_N_PER_DOC);
  const [prompt, setPrompt] = useState(DEFAULT_SYNTHESIS_PROMPT);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [questions, setQuestions] = useState<SynthesizedQuestionView[] | null>(
    initialItems.length > 0
      ? initialItems.map((item) => ({
          id: item.id,
          question: item.question,
          expected_facts: item.expected_facts,
          difficulty: item.difficulty ?? undefined,
        }))
      : null,
  );
  const [items, setItems] = useState<SynthesizePanelItem[]>(initialItems);
  const [versionId, setVersionId] = useState<string | null>(initialVersionId);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editFacts, setEditFacts] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaignRows, setCampaignRows] = useState<
    Extract<CampaignApiResponse, { ok: true }>["table"] | null
  >(null);

  const selected = useMemo(
    () => documents.find((doc) => doc.slug === selectedSlug) ?? null,
    [documents, selectedSlug],
  );

  const goldCount = items.filter((item) => item.is_gold).length;
  const displayItems = items.length > 0 ? items : null;
  const catalog = templates.length > 0 ? templates : BUILTIN_SYNTHESIS_TEMPLATES;
  const modeTemplates = catalog.filter((template) => template.mode === mode);

  function applyTemplate(key: string, nextMode?: SynthesisMode) {
    const [id, version] = key.split("@");
    const found = catalog.find(
      (template) =>
        template.id === id &&
        template.version === (version || "1") &&
        (!nextMode || template.mode === nextMode),
    );
    if (found) {
      setPrompt(found.body);
      setTemplateKey(`${found.id}@${found.version}`);
    }
  }

  async function onGenerate() {
    if (!selected) {
      setError("Select a document before generating.");
      return;
    }
    if (!prompt.trim()) {
      setError("Add a synthesis prompt before generating.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    setQuestions(null);
    setItems([]);
    setVersionId(null);
    setUsedModel(null);
    setCampaignId(null);
    setCampaignRows(null);
    setEditingId(null);
    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selected.slug,
          slugs: [selected.slug, ...extraSlugs.filter((slug) => slug !== selected.slug)],
          prompt,
          mode,
          nPerDoc,
          templateId: templateKey.split("@")[0],
          templateVersion: templateKey.split("@")[1] || "1",
        }),
      });
      const data = (await response.json()) as SynthesizeApiResponse;
      if (!data.ok) {
        setError(data.error || `Synthesis failed (HTTP ${response.status})`);
        return;
      }
      const nextItems = itemsFromResponse(data);
      setQuestions(data.questions);
      setItems(nextItems);
      setVersionId(data.versionId ?? null);
      setUsedModel(data.model);
      setNotice(
        `Generated ${nextItems.length} pending question${nextItems.length === 1 ? "" : "s"} for “${data.title}” via XAI_API_KEY2. Keep, edit, or reject before gold.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synthesis request failed");
    } finally {
      setPending(false);
    }
  }

  async function onReview(
    item: SynthesizePanelItem,
    action: "keep" | "edit" | "reject",
    payload?: { question?: string; expected_facts?: string[] },
  ) {
    if (!item.id) {
      setError("Item is missing an id; generate again to persist.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/datasets/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          action,
          ...payload,
        }),
      });
      const data = (await response.json()) as ReviewApiResponse;
      if (!data.ok) {
        setError(data.error || "Review failed");
        return;
      }
      setItems((current) =>
        current.map((row) => (row.id === data.item.id ? data.item : row)),
      );
      setEditingId(null);
      setNotice(
        action === "reject"
          ? "Rejected — item stays non-gold."
          : action === "edit"
            ? "Edited and marked gold."
            : "Kept as gold.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review request failed");
    } finally {
      setPending(false);
    }
  }

  async function onRunCampaign() {
    if (!versionId) {
      setError("Generate and keep gold items before running a campaign.");
      return;
    }
    if (goldCount === 0) {
      setError("Keep or edit at least one item before running a campaign.");
      return;
    }
    setPending(true);
    setError(null);
    setCampaignId(null);
    setCampaignRows(null);
    try {
      const response = await fetch("/api/datasets/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const data = (await response.json()) as CampaignApiResponse;
      if (!data.ok) {
        setError(data.error || "Campaign failed");
        return;
      }
      setCampaignId(data.campaignId);
      setCampaignRows(data.table);
      setNotice(
        `Ran campaign ${data.campaignId} on ${data.table.length} gold item${data.table.length === 1 ? "" : "s"} (generate → evaluate).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign request failed");
    } finally {
      setPending(false);
    }
  }

  function onExport(format: "jsonl" | "csv") {
    if (!versionId) return;
    window.location.href = `/api/datasets/export?versionId=${encodeURIComponent(versionId)}&format=${format}`;
  }

  return (
    <section
      data-testid="synthesize-panel"
      className="rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7"
    >
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Question synthesis
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">
          Synthesize from full text
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Choose a stored article, edit the synthesis prompt, then generate
          grounded evaluation questions with the secondary xAI key (
          <code className="font-mono text-xs">XAI_API_KEY2</code>
          ). Full article text is injected server-side at generation time.
          Raw output is stored as pending items — keep, edit, or reject before
          gold.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div data-testid="synthesize-doc-list" className="flex flex-col gap-2">
          <p className="text-sm font-medium">Available documents</p>
          {documents.length === 0 ? (
            <p
              data-testid="synthesize-doc-empty"
              className="rounded-xl border border-dashed border-border bg-background/50 px-3.5 py-4 text-sm leading-6 text-muted"
            >
              No stored documents yet. Ingest Wikipedia seeds with{" "}
              <code className="font-mono text-xs">npm run graph:ingest-whales</code>
              .
            </p>
          ) : (
            <ul className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto pr-0.5">
              {documents.map((doc) => {
                const selectedRow = doc.slug === selectedSlug;
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      data-testid={`synthesize-doc-${doc.slug}`}
                      data-slug={doc.slug}
                      aria-pressed={selectedRow}
                      disabled={pending}
                      onClick={() => {
                        setSelectedSlug(doc.slug);
                        setNotice(null);
                        setError(null);
                      }}
                      className={[
                        "w-full rounded-xl border px-3.5 py-3 text-left transition",
                        selectedRow
                          ? "border-accent bg-accent/10 shadow-sm"
                          : "border-border bg-background/60 hover:bg-surface-muted/80",
                      ].join(" ")}
                    >
                      <span className="block text-sm font-semibold leading-tight">
                        {doc.title}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted">
                        {doc.slug}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-muted">
                        {formatCharCount(doc.charCount)} · {doc.site}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div
            data-testid="synthesize-selection"
            className="rounded-xl border border-border/70 bg-background/60 px-3.5 py-3 text-sm"
          >
            {selected ? (
              <>
                <p className="font-medium">{selected.title}</p>
                <p className="mt-1 font-mono text-xs text-muted">{selected.slug}</p>
                <a
                  href={selected.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-xs text-accent underline-offset-2 hover:underline"
                >
                  {selected.canonicalUrl}
                </a>
              </>
            ) : (
              <p className="text-muted">No document selected.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Label htmlFor="synthesis-mode">
              <span>Mode</span>
              <Select
                id="synthesis-mode"
                data-testid="synthesize-mode"
                value={mode}
                disabled={pending}
                onChange={(event) => {
                  const next = event.target.value as SynthesisMode;
                  setMode(next);
                  const first = catalog.find((template) => template.mode === next);
                  if (first) applyTemplate(`${first.id}@${first.version}`, next);
                }}
              >
                {SYNTHESIS_MODES.map((id) => (
                  <option key={id} value={id}>
                    {id.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Label>
            <Label htmlFor="synthesis-template">
              <span>Prompt template</span>
              <Select
                id="synthesis-template"
                data-testid="synthesize-template"
                value={templateKey}
                disabled={pending}
                onChange={(event) => applyTemplate(event.target.value, mode)}
              >
                {modeTemplates.map((template) => (
                  <option
                    key={`${template.id}@${template.version}`}
                    value={`${template.id}@${template.version}`}
                  >
                    {template.name} v{template.version}
                  </option>
                ))}
              </Select>
            </Label>
            <Label htmlFor="synthesis-n-per-doc">
              <span>Questions per doc</span>
              <Input
                id="synthesis-n-per-doc"
                data-testid="synthesize-n-per-doc"
                type="number"
                min={1}
                max={20}
                value={nPerDoc}
                disabled={pending}
                onChange={(event) =>
                  setNPerDoc(Math.max(1, Number(event.target.value) || 1))
                }
              />
            </Label>
          </div>

          {mode === "multi_hop" ? (
            <fieldset data-testid="synthesize-multi-docs">
              <legend className="mb-1 text-sm font-medium">Additional documents</legend>
              <ul className="flex flex-col gap-1">
                {documents
                  .filter((doc) => doc.slug !== selectedSlug)
                  .map((doc) => (
                    <li key={doc.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          data-testid={`synthesize-extra-${doc.slug}`}
                          checked={extraSlugs.includes(doc.slug)}
                          disabled={pending}
                          onChange={(event) => {
                            setExtraSlugs((current) =>
                              event.target.checked
                                ? [...current, doc.slug]
                                : current.filter((slug) => slug !== doc.slug),
                            );
                          }}
                        />
                        {doc.title}
                      </label>
                    </li>
                  ))}
              </ul>
            </fieldset>
          ) : null}

          <Label htmlFor="synthesis-prompt">
            <span>Synthesis prompt</span>
            <Textarea
              id="synthesis-prompt"
              data-testid="synthesize-prompt"
              name="synthesisPrompt"
              rows={14}
              value={prompt}
              disabled={pending}
              onChange={(event) => {
                setPrompt(event.target.value);
                setNotice(null);
                setError(null);
              }}
              className="min-h-[16rem] font-mono text-[13px] leading-5"
              placeholder="Describe how to turn article full text into judge questions…"
            />
            <span className="text-xs font-normal leading-5 text-muted">
              Placeholders:{" "}
              <code className="font-mono">{"{{title}}"}</code>,{" "}
              <code className="font-mono">{"{{url}}"}</code>,{" "}
              <code className="font-mono">{"{{full_text}}"}</code>
            </span>
          </Label>

          {error ? (
            <p data-testid="synthesize-error" className="text-sm text-fail">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p data-testid="synthesize-notice" className="text-sm text-pass">
              {notice}
              {usedModel ? (
                <span className="mt-1 block font-mono text-xs text-muted">
                  model: {usedModel}
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="synthesize-generate"
              onClick={() => void onGenerate()}
              disabled={pending || !selected || !prompt.trim()}
            >
              {pending ? "Generating…" : "Generate questions"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              data-testid="synthesize-reset-prompt"
              disabled={pending}
              onClick={() => {
                setPrompt(DEFAULT_SYNTHESIS_PROMPT);
                setNotice(null);
                setError(null);
              }}
            >
              Reset prompt
            </Button>
            <Button
              type="button"
              variant="secondary"
              data-testid="synthesize-run-campaign"
              disabled={pending || goldCount === 0 || !versionId}
              onClick={() => void onRunCampaign()}
            >
              Run campaign from gold
            </Button>
            <Button
              type="button"
              variant="ghost"
              data-testid="synthesize-export-jsonl"
              disabled={pending || goldCount === 0 || !versionId}
              onClick={() => onExport("jsonl")}
            >
              Export JSONL
            </Button>
            <Button
              type="button"
              variant="ghost"
              data-testid="synthesize-export-csv"
              disabled={pending || goldCount === 0 || !versionId}
              onClick={() => onExport("csv")}
            >
              Export CSV
            </Button>
          </div>

          {displayItems && displayItems.length > 0 ? (
            <ol
              data-testid="synthesize-results"
              className="flex flex-col gap-3 border-t border-border/70 pt-4"
            >
              {displayItems.map((item, index) => (
                <li
                  key={item.id || `${index}-${item.question.slice(0, 24)}`}
                  data-testid={`synthesize-result-${index}`}
                  className="rounded-xl border border-border bg-background/70 px-3.5 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Question {index + 1}
                    {item.difficulty ? ` · ${item.difficulty}` : ""}
                    {` · ${item.review_status}`}
                    {item.is_gold ? " · gold" : " · not gold"}
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-6">
                    {item.question}
                  </p>
                  {item.expected_facts.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
                      {item.expected_facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid={
                        index === 0 ? "synthesize-keep" : `synthesize-keep-${index}`
                      }
                      disabled={pending}
                      onClick={() => void onReview(item, "keep")}
                    >
                      Keep
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      data-testid={
                        index === 0 ? "synthesize-edit" : `synthesize-edit-${index}`
                      }
                      disabled={pending}
                      onClick={() => {
                        setEditingId(item.id);
                        setEditQuestion(item.question);
                        setEditFacts(item.expected_facts.join("\n"));
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={
                        index === 0
                          ? "synthesize-reject"
                          : `synthesize-reject-${index}`
                      }
                      disabled={pending}
                      onClick={() => void onReview(item, "reject")}
                    >
                      Reject
                    </Button>
                  </div>

                  {editingId === item.id ? (
                    <div
                      data-testid={`synthesize-edit-form-${index}`}
                      className="mt-3 flex flex-col gap-2"
                    >
                      <Textarea
                        data-testid={`synthesize-edit-question-${index}`}
                        rows={3}
                        value={editQuestion}
                        disabled={pending}
                        onChange={(event) => setEditQuestion(event.target.value)}
                      />
                      <Textarea
                        data-testid={`synthesize-edit-facts-${index}`}
                        rows={3}
                        value={editFacts}
                        disabled={pending}
                        onChange={(event) => setEditFacts(event.target.value)}
                        placeholder="One expected fact per line"
                      />
                      <Button
                        type="button"
                        size="sm"
                        data-testid={`synthesize-edit-save-${index}`}
                        disabled={pending || !editQuestion.trim()}
                        onClick={() =>
                          void onReview(item, "edit", {
                            question: editQuestion,
                            expected_facts: editFacts
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(Boolean),
                          })
                        }
                      >
                        Save edit as gold
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : questions && questions.length > 0 ? (
            <ol
              data-testid="synthesize-results"
              className="flex flex-col gap-3 border-t border-border/70 pt-4"
            >
              {questions.map((item, index) => (
                <li
                  key={`${index}-${item.question.slice(0, 24)}`}
                  data-testid={`synthesize-result-${index}`}
                  className="rounded-xl border border-border bg-background/70 px-3.5 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Question {index + 1}
                    {item.difficulty ? ` · ${item.difficulty}` : ""}
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-6">
                    {item.question}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}

          {campaignId ? (
            <div
              data-testid="synthesize-campaign-result"
              className="rounded-xl border border-border bg-background/70 px-3.5 py-3 text-sm"
            >
              <p className="font-medium">Campaign {campaignId}</p>
              {campaignRows ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  {campaignRows.map((row) => (
                    <li key={row.fixtureId}>
                      {row.fixtureId}:{" "}
                      {row.error
                        ? row.error
                        : `overall ${row.overall ?? "—"} ${row.passed ? "pass" : "fail"}`}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
