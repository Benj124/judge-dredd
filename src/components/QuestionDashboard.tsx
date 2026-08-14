"use client";

import { useMemo, useState } from "react";
import { campaignTableRows } from "@/lib/eval/campaignTable";
import { formatOverall } from "@/lib/eval/format";
import { questionToEvaluateBody } from "@/lib/eval/questions";
import type { TestQuestion } from "@/lib/eval/questions";
import type { EvaluateResult } from "@/lib/eval/types";
import { PassFailBadge } from "./PassFailBadge";
import type { VerdictView } from "./VerdictPanel";

type EvaluateResponse =
  | { ok: true; verdict: VerdictView; runId?: string }
  | { ok: false; error: string; code?: string };

type RowState = {
  pending: boolean;
  error: string | null;
  verdict: VerdictView | null;
};

async function evaluateQuestion(
  question: TestQuestion,
  campaignId: string,
): Promise<EvaluateResponse> {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...questionToEvaluateBody(question),
      campaignId,
    }),
  });
  return (await response.json()) as EvaluateResponse;
}

function newCampaignId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `campaign-${Date.now()}`;
}

export function QuestionDashboard({
  questions,
  csvJobs = [],
}: {
  questions: TestQuestion[];
  csvJobs?: TestQuestion[];
}) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [runningCsv, setRunningCsv] = useState(false);

  function patch(id: string, next: Partial<RowState>) {
    setRows((current) => {
      const previous = current[id] ?? {
        pending: false,
        error: null,
        verdict: null,
      };
      return { ...current, [id]: { ...previous, ...next } };
    });
  }

  async function runOne(question: TestQuestion, campaignId = newCampaignId()) {
    patch(question.id, { pending: true, error: null, verdict: null });
    try {
      const data = await evaluateQuestion(question, campaignId);
      if (!data.ok) {
        patch(question.id, { pending: false, error: data.error, verdict: null });
        return;
      }
      patch(question.id, { pending: false, error: null, verdict: data.verdict });
    } catch (error) {
      patch(question.id, {
        pending: false,
        error: error instanceof Error ? error.message : "Request failed",
        verdict: null,
      });
    }
  }

  async function runAll() {
    setRunningAll(true);
    const campaignId = newCampaignId();
    for (const question of questions) {
      await runOne(question, campaignId);
    }
    setRunningAll(false);
  }

  async function runCsv() {
    setRunningCsv(true);
    const campaignId = newCampaignId();
    for (const job of csvJobs) {
      await runOne(job, campaignId);
    }
    setRunningCsv(false);
  }

  const busy =
    runningAll ||
    runningCsv ||
    Object.values(rows).some((row) => row.pending);

  const listedQuestions = useMemo(() => {
    const seen = new Set(questions.map((question) => question.id));
    return [
      ...questions,
      ...csvJobs.filter((job) => !seen.has(job.id)),
    ];
  }, [csvJobs, questions]);

  const tableRuns = useMemo(
    () =>
      listedQuestions.map((question) => {
        const state = rows[question.id];
        const result: EvaluateResult = state?.verdict
          ? { ok: true, verdict: state.verdict }
          : state?.error
            ? { ok: false, error: state.error, code: "judge" }
            : { ok: false, error: "", code: "precheck" };
        return { id: question.id, result };
      }),
    [listedQuestions, rows],
  );

  const table = campaignTableRows(
    listedQuestions,
    tableRuns.filter((run) => {
      const state = rows[run.id];
      return Boolean(state?.verdict || state?.error);
    }),
  );

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Fixtures
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">
            Evaluation questions
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Run the five built-in fixtures, or kick off the eval_data.csv
            fact-check set from the same campaign table.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runAll()}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningAll ? "Running fixtures…" : "Run all fixtures"}
          </button>
          {csvJobs.length > 0 ? (
            <button
              type="button"
              onClick={() => void runCsv()}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runningCsv
                ? `Running CSV…`
                : `Run eval_data.csv (${csvJobs.length})`}
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Campaign results</caption>
          <thead className="bg-surface-muted/80 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Question</th>
              <th className="px-3 py-2 font-medium">Overall</th>
              <th className="px-3 py-2 font-medium">Pass/fail</th>
            </tr>
          </thead>
          <tbody>
            {listedQuestions.map((question) => {
              const row = table.find((entry) => entry.fixtureId === question.id);
              return (
                <tr
                  key={question.id}
                  className="border-t border-border/70"
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted">
                      {question.id}
                    </span>
                    <span className="mt-0.5 block">
                      {question.title ?? question.id}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {row && row.overall !== null
                      ? formatOverall(row.overall)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row && row.overall !== null ? (
                      <PassFailBadge passed={row.passed} size="sm" />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-4">
        {questions.map((question) => {
          const state = rows[question.id];
          return (
            <li
              key={question.id}
              className="rounded-xl border border-border/80 bg-background/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-muted">{question.id}</p>
                    {state?.verdict && !state.pending ? (
                      <PassFailBadge passed={state.verdict.passed} size="sm" />
                    ) : null}
                  </div>
                  <h3 className="mt-1 text-base font-medium">
                    {question.title ?? question.id}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {question.subject}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runOne(question)}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {state?.pending ? "Running…" : "Run"}
                </button>
              </div>

              {state?.pending ? (
                <p className="mt-3 text-sm text-pending">Evaluating…</p>
              ) : null}
              {state?.error ? (
                <p className="mt-3 text-sm text-fail">{state.error}</p>
              ) : null}
              {state?.verdict ? (
                <div className="mt-3 rounded-lg bg-surface-muted/70 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PassFailBadge passed={state.verdict.passed} size="sm" />
                    <p className="text-sm">
                      Overall {formatOverall(state.verdict.overall)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {state.verdict.scores
                      .map((score) => `${score.id} ${score.score}`)
                      .join(" · ")}
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    {state.verdict.rationale}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
