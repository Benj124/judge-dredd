"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VerdictPanel, type VerdictView } from "./VerdictPanel";

export type RubricOption = {
  id: string;
  name: string;
  description: string;
  criteria: Array<{
    id: string;
    name: string;
    scale: { min: number; max: number };
  }>;
};

type EvaluateResponse =
  | { ok: true; verdict: VerdictView }
  | { ok: false; error: string; code?: string };

export function PlaygroundForm({ rubrics: initialRubrics }: { rubrics: RubricOption[] }) {
  const [rubrics, setRubrics] = useState(initialRubrics);
  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [reference, setReference] = useState("");
  const [rubricId, setRubricId] = useState(initialRubrics[0]?.id ?? "default");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VerdictView | null>(null);

  const refreshRubrics = useCallback(async () => {
    try {
      const response = await fetch("/api/rubrics");
      const data = (await response.json()) as {
        ok: boolean;
        rubrics?: RubricOption[];
      };
      if (data.ok && data.rubrics?.length) {
        setRubrics(data.rubrics);
      }
    } catch {
      // Keep initial server list if refresh fails.
    }
  }, []);

  useEffect(() => {
    void refreshRubrics();
  }, [refreshRubrics]);

  const selected = useMemo(
    () => rubrics.find((rubric) => rubric.id === rubricId) ?? rubrics[0],
    [rubricId, rubrics],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setVerdict(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          context: context.trim() || undefined,
          reference: reference.trim() || undefined,
          rubricId,
        }),
      });
      const data = (await response.json()) as EvaluateResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setVerdict(data.verdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  const fieldClass =
    "w-full resize-y rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-[15px] leading-6 text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Playground
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">
            Evaluate a subject
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Paste an LLM output or other resource. Optional context and
            reference improve faithfulness scoring.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5" htmlFor="subject">
            <span className="text-sm font-medium">Subject</span>
            <textarea
              id="subject"
              name="subject"
              required
              disabled={pending}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              rows={7}
              className={fieldClass}
              placeholder="Output or resource to evaluate"
            />
          </label>

          <label className="flex flex-col gap-1.5" htmlFor="context">
            <span className="text-sm font-medium">
              Context <span className="font-normal text-muted">(optional)</span>
            </span>
            <textarea
              id="context"
              name="context"
              disabled={pending}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={4}
              className={fieldClass}
              placeholder="Prompt, sources, or surrounding material"
            />
          </label>

          <label className="flex flex-col gap-1.5" htmlFor="reference">
            <span className="text-sm font-medium">
              Reference{" "}
              <span className="font-normal text-muted">(optional)</span>
            </span>
            <textarea
              id="reference"
              name="reference"
              disabled={pending}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              rows={3}
              className={fieldClass}
              placeholder="Gold answer or expected content"
            />
          </label>

          <label className="flex flex-col gap-1.5" htmlFor="rubric">
            <span className="text-sm font-medium">Evaluation prompt</span>
            <select
              id="rubric"
              name="rubric"
              disabled={pending}
              value={rubricId}
              onChange={(event) => setRubricId(event.target.value)}
              className={fieldClass}
            >
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name}
                </option>
              ))}
            </select>
            {selected?.description ? (
              <span className="text-xs leading-5 text-muted">
                {selected.description}
              </span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={pending}
            className="mt-1 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Evaluating…" : "Evaluate"}
          </button>
        </form>
      </section>

      <VerdictPanel
        pending={pending}
        error={error}
        verdict={verdict}
        criteria={selected?.criteria ?? []}
      />
    </div>
  );
}
