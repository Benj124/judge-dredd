"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatOverall } from "@/lib/eval/format";
import { PassFailBadge } from "./PassFailBadge";

type HistoryRun = {
  id: string;
  createdAt: string;
  subject: string;
  rubricId: string;
  rubricVersion: string;
  fixtureId: string | null;
  verdict: {
    overall: number;
    passed: boolean | null;
    scores: Array<{ id: string; score: number; rationale?: string }>;
    rationale: string;
  };
};

export function HistoryPanel() {
  const [rubricId, setRubricId] = useState("");
  const [passed, setPassed] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (rubricId.trim()) params.set("rubricId", rubricId.trim());
    if (passed) params.set("passed", passed);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    try {
      const response = await fetch(`/api/runs${query ? `?${query}` : ""}`);
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        runs?: HistoryRun[];
      };
      if (!data.ok) {
        setError(data.error ?? "Failed to list runs");
        setRuns([]);
        return;
      }
      setRuns(data.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list runs");
    } finally {
      setLoading(false);
    }
  }, [from, passed, rubricId, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openRun(id: string) {
    setOpenId(id);
    setDetail(null);
    const response = await fetch(`/api/runs/${id}`);
    const data = (await response.json()) as {
      ok: boolean;
      run?: HistoryRun;
      error?: string;
    };
    if (!data.ok || !data.run) {
      setError(data.error ?? "Failed to load run");
      return;
    }
    setDetail(data.run);
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          History
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">
          Evaluate runs
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Filter persisted judgments by rubric, pass/fail, and date. Open a
          row for the stored subject and verdict.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Rubric</span>
          <input
            name="rubricId"
            value={rubricId}
            onChange={(event) => setRubricId(event.target.value)}
            placeholder="default"
            className="rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pass/fail</span>
          <select
            name="passed"
            value={passed}
            onChange={(event) => setPassed(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2"
          >
            <option value="">All</option>
            <option value="true">Pass</option>
            <option value="false">Fail</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From date</span>
          <input
            type="date"
            name="from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">To date</span>
          <input
            type="date"
            name="to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg sm:col-span-2 lg:col-span-4"
        >
          {loading ? "Loading…" : "Apply filters"}
        </button>
      </form>

      {error ? <p className="text-sm text-fail">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Evaluate run history</caption>
          <thead className="bg-surface-muted/80 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Rubric</th>
              <th className="px-3 py-2 font-medium">Pass/fail</th>
              <th className="px-3 py-2 font-medium">Overall</th>
              <th className="px-3 py-2 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-muted" colSpan={5}>
                  No runs match these filters.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-t border-border/70">
                  <td className="px-3 py-2 font-mono text-xs">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{run.rubricId}</td>
                  <td className="px-3 py-2">
                    <PassFailBadge passed={run.verdict.passed} size="sm" />
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {formatOverall(run.verdict.overall)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void openRun(run.id)}
                      className="mr-3 text-sm font-medium underline"
                    >
                      View
                    </button>
                    <Link
                      href={`/history/${run.id}`}
                      className="text-sm font-medium underline"
                    >
                      Page
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openId && detail && detail.id === openId ? (
        <article className="rounded-xl border border-border bg-background/60 p-4">
          <h3 className="font-display text-xl">Run {detail.id.slice(0, 8)}</h3>
          <p className="mt-2 text-sm leading-6">
            <span className="text-muted">Subject · </span>
            {detail.subject}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PassFailBadge passed={detail.verdict.passed} />
            <span>Overall {formatOverall(detail.verdict.overall)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {detail.verdict.scores
              .map((score) => `${score.id} ${score.score}`)
              .join(" · ")}
          </p>
          <p className="mt-3 text-sm leading-6">{detail.verdict.rationale}</p>
        </article>
      ) : null}
    </section>
  );
}
