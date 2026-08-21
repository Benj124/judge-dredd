"use client";

import { useMemo, useState } from "react";
import type { TextDocumentSummary } from "@/lib/graph/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SynthesizeDocument = Pick<
  TextDocumentSummary,
  "id" | "slug" | "title" | "canonicalUrl" | "site" | "charCount"
>;

export type SynthesizedQuestionView = {
  question: string;
  expected_facts: string[];
  difficulty?: string;
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
    }
  | { ok: false; error: string; code?: string };

export function SynthesizePanel({
  documents,
}: {
  documents: SynthesizeDocument[];
}) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    documents[0]?.slug ?? null,
  );
  const [prompt, setPrompt] = useState(DEFAULT_SYNTHESIS_PROMPT);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [questions, setQuestions] = useState<SynthesizedQuestionView[] | null>(
    null,
  );
  const [usedModel, setUsedModel] = useState<string | null>(null);

  const selected = useMemo(
    () => documents.find((doc) => doc.slug === selectedSlug) ?? null,
    [documents, selectedSlug],
  );

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
    setUsedModel(null);
    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selected.slug,
          prompt,
        }),
      });
      const data = (await response.json()) as SynthesizeApiResponse;
      if (!data.ok) {
        setError(data.error || `Synthesis failed (HTTP ${response.status})`);
        return;
      }
      setQuestions(data.questions);
      setUsedModel(data.model);
      setNotice(
        `Generated ${data.questions.length} question${data.questions.length === 1 ? "" : "s"} for “${data.title}” via XAI_API_KEY2.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synthesis request failed");
    } finally {
      setPending(false);
    }
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
          </div>

          {questions && questions.length > 0 ? (
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
                  {item.expected_facts.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
                      {item.expected_facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </section>
  );
}
