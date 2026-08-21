"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
          <Label htmlFor="subject">
            <span>Subject</span>
            <Textarea
              id="subject"
              name="subject"
              required
              disabled={pending}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              rows={7}
              placeholder="Output or resource to evaluate"
            />
          </Label>

          <Label htmlFor="context">
            <span>
              Context <span className="font-normal text-muted">(optional)</span>
            </span>
            <Textarea
              id="context"
              name="context"
              disabled={pending}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={4}
              placeholder="Prompt, sources, or surrounding material"
            />
          </Label>

          <Label htmlFor="reference">
            <span>
              Reference{" "}
              <span className="font-normal text-muted">(optional)</span>
            </span>
            <Textarea
              id="reference"
              name="reference"
              disabled={pending}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              rows={3}
              placeholder="Gold answer or expected content"
            />
          </Label>

          <Label htmlFor="rubric">
            <span>Evaluation prompt</span>
            <Select
              id="rubric"
              name="rubric"
              disabled={pending}
              value={rubricId}
              onChange={(event) => setRubricId(event.target.value)}
            >
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name}
                </option>
              ))}
            </Select>
            {selected?.description ? (
              <span className="text-xs font-normal leading-5 text-muted">
                {selected.description}
              </span>
            ) : null}
          </Label>

          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "Evaluating…" : "Evaluate"}
          </Button>
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
