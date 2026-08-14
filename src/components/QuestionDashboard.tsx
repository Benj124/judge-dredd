"use client";

import { useMemo, useState } from "react";
import { campaignTableRows } from "@/lib/eval/campaignTable";
import { formatOverall } from "@/lib/eval/format";
import { DEFAULT_GENERATE_MODEL } from "@/lib/eval/generate";
import { questionToEvaluateBody } from "@/lib/eval/questions";
import type { TestQuestion } from "@/lib/eval/questions";
import { accuracyFromScores } from "@/lib/eval/stream";
import type { EvaluateResult } from "@/lib/eval/types";
import { LiveRunChart, type LiveMetricPoint } from "./LiveRunChart";
import { PassFailBadge } from "./PassFailBadge";
import type { VerdictView } from "./VerdictPanel";

type EvaluateResponse =
  | { ok: true; verdict: VerdictView; runId?: string }
  | { ok: false; error: string; code?: string };

type RowState = {
  pending: boolean;
  phase: "idle" | "generating" | "evaluating";
  error: string | null;
  verdict: VerdictView | null;
  generated?: string;
  ttftMs?: number | null;
  accuracy?: number | null;
};

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}

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
  const text = await response.text();
  try {
    return JSON.parse(text) as EvaluateResponse;
  } catch {
    return {
      ok: false,
      error: `HTTP ${response.status}: ${text.slice(0, 180) || "empty response"}`,
      code: "judge",
    };
  }
}

function newCampaignId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `campaign-${Date.now()}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 text-sm leading-6 whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
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
  const [generateModel, setGenerateModel] = useState(DEFAULT_GENERATE_MODEL);
  const [series, setSeries] = useState<LiveMetricPoint[]>([]);
  const [progress, setProgress] = useState<{
    current: string;
    index: number;
    total: number;
    phase: "generating" | "evaluating";
  } | null>(null);

  function patch(id: string, next: Partial<RowState>) {
    setRows((current) => {
      const previous = current[id] ?? {
        pending: false,
        phase: "idle" as const,
        error: null,
        verdict: null,
      };
      return { ...current, [id]: { ...previous, ...next } };
    });
  }

  function upsertSeries(id: string, next: Partial<LiveMetricPoint>) {
    setSeries((current) => {
      const index = current.findIndex((point) => point.id === id);
      if (index < 0) {
        return [...current, { id, accuracy: null, ttftMs: null, ...next }];
      }
      const copy = [...current];
      copy[index] = { ...copy[index], ...next };
      return copy;
    });
  }



  async function generateOne(question: TestQuestion): Promise<string | null> {
    patch(question.id, {
      pending: true,
      phase: "generating",
      error: null,
      verdict: null,
    });
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: question.context,
          subject: question.subject,
          model: generateModel,
        }),
      });
      const text = await response.text();
      let data: {
        ok: boolean;
        text?: string;
        error?: string;
        ttftMs?: number | null;
      };
      try {
        data = JSON.parse(text) as {
          ok: boolean;
          text?: string;
          error?: string;
          ttftMs?: number | null;
        };
      } catch {
        patch(question.id, {
          pending: false,
          phase: "idle",
          error: `HTTP ${response.status}: ${text.slice(0, 180)}`,
        });
        return null;
      }
      if (!data.ok || !data.text?.trim()) {
        patch(question.id, {
          pending: false,
          phase: "idle",
          error: data.error ?? "Generator returned no text",
        });
        return null;
      }
      const generated = data.text.trim();
      const ttftMs = typeof data.ttftMs === "number" ? data.ttftMs : null;
      patch(question.id, {
        pending: false,
        phase: "idle",
        generated,
        error: null,
        ttftMs,
      });
      if (ttftMs !== null) {
        upsertSeries(question.id, { ttftMs });
      }
      return generated;
    } catch (error) {
      patch(question.id, {
        pending: false,
        phase: "idle",
        error: error instanceof Error ? error.message : "Generate failed",
      });
      return null;
    }
  }

  async function runOne(
    question: TestQuestion,
    campaignId = newCampaignId(),
    index?: number,
    total?: number,
    subjectOverride?: string,
  ) {
    if (typeof index === "number" && typeof total === "number") {
      setProgress({
        current: question.id,
        index,
        total,
        phase: "evaluating",
      });
    }
    const job = subjectOverride
      ? { ...question, subject: subjectOverride }
      : question;
    patch(question.id, {
      pending: true,
      phase: "evaluating",
      error: null,
      verdict: null,
    });
    try {
      const data = await evaluateQuestion(job, campaignId);
      if (!data.ok) {
        patch(question.id, {
          pending: false,
          phase: "idle",
          error: data.error,
          verdict: null,
        });
        return;
      }
      patch(question.id, {
        pending: false,
        phase: "idle",
        error: null,
        verdict: data.verdict,
        accuracy: accuracyFromScores(data.verdict.scores, data.verdict.overall),
      });
      upsertSeries(question.id, {
        accuracy: accuracyFromScores(data.verdict.scores, data.verdict.overall),
      });
    } catch (error) {
      patch(question.id, {
        pending: false,
        phase: "idle",
        error: error instanceof Error ? error.message : "Request failed",
        verdict: null,
      });
    }
  }

  async function generateAndEvaluate(
    question: TestQuestion,
    campaignId = newCampaignId(),
    index?: number,
    total?: number,
  ) {
    if (typeof index === "number" && typeof total === "number") {
      setProgress({
        current: question.id,
        index,
        total,
        phase: "generating",
      });
    }
    const generated = await generateOne(question);
    if (!generated) return;
    await runOne(question, campaignId, index, total, generated);
  }

  async function runQueue(
    list: TestQuestion[],
    kind: "fixtures" | "csv",
    mode: "evaluate" | "generate-evaluate",
  ) {
    if (kind === "fixtures") setRunningAll(true);
    else setRunningCsv(true);
    const campaignId = newCampaignId();
    for (let i = 0; i < list.length; i += 1) {
      if (mode === "generate-evaluate") {
        await generateAndEvaluate(list[i], campaignId, i + 1, list.length);
      } else {
        await runOne(list[i], campaignId, i + 1, list.length);
      }
    }
    setProgress(null);
    setRunningAll(false);
    setRunningCsv(false);
  }

  const busy =
    runningAll ||
    runningCsv ||
    Object.values(rows).some((row) => row.pending);

  const listedQuestions = useMemo(() => {
    const seen = new Set(questions.map((question) => question.id));
    return [...questions, ...csvJobs.filter((job) => !seen.has(job.id))];
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

  const doneCount = listedQuestions.filter(
    (question) => rows[question.id]?.verdict || rows[question.id]?.error,
  ).length;

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
            Score canned outputs, or generate judged text from each question
            with a candidate model, then evaluate it against expected facts.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <label className="flex flex-col gap-1 text-xs sm:min-w-[16rem]">
            <span className="font-medium text-muted">Candidate model</span>
            <input
              value={generateModel}
              onChange={(event) => setGenerateModel(event.target.value)}
              disabled={busy}
              className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              placeholder={DEFAULT_GENERATE_MODEL}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runQueue(questions, "fixtures", "evaluate")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runningAll ? <Spinner className="h-4 w-4" /> : null}
              {runningAll ? "Running fixtures…" : "Run all fixtures"}
            </button>
            <button
              type="button"
              onClick={() =>
                void runQueue(questions, "fixtures", "generate-evaluate")
              }
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Generate + evaluate fixtures
            </button>
            {csvJobs.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => void runQueue(csvJobs, "csv", "evaluate")}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningCsv ? <Spinner className="h-4 w-4" /> : null}
                  {runningCsv
                    ? "Running CSV…"
                    : `Run eval_data.csv (${csvJobs.length})`}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runQueue(csvJobs, "csv", "generate-evaluate")
                  }
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Generate + evaluate CSV
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <LiveRunChart points={series} />

      {progress ? (
        <div className="flex items-center gap-3 rounded-xl border border-pending/30 bg-surface-muted/60 px-4 py-3">
          <Spinner className="h-5 w-5 text-pending" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {progress.phase === "generating" ? "Generating" : "Evaluating"}{" "}
              {progress.current}{" "}
              <span className="font-mono text-muted">
                ({progress.index}/{progress.total})
              </span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{
                  width: `${Math.round((progress.index / progress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      ) : doneCount > 0 ? (
        <p className="text-xs text-muted">
          {doneCount} / {listedQuestions.length} scored
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Campaign results</caption>
          <thead className="bg-surface-muted/80 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Question</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Overall</th>
              <th className="px-3 py-2 font-medium">Pass/fail</th>
            </tr>
          </thead>
          <tbody>
            {listedQuestions.map((question) => {
              const row = table.find((entry) => entry.fixtureId === question.id);
              const state = rows[question.id];
              const isActive = Boolean(state?.pending);
              return (
                <tr
                  key={question.id}
                  className={`border-t border-border/70 ${isActive ? "bg-pending/10" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted">
                      {question.id}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-pending">
                        <Spinner className="h-3.5 w-3.5" />
                        {state?.phase === "generating"
                          ? "Generating"
                          : "Evaluating"}
                      </span>
                    ) : state?.error ? (
                      <span className="text-fail">Error</span>
                    ) : state?.verdict ? (
                      <span className="text-pass">Done</span>
                    ) : (
                      <span className="text-muted">Queued</span>
                    )}
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
        {listedQuestions.map((question) => {
          const state = rows[question.id];
          return (
            <li
              key={question.id}
              className={`rounded-xl border bg-background/50 p-4 ${
                state?.pending
                  ? "border-pending/50 ring-1 ring-pending/20"
                  : "border-border/80"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {state?.pending ? (
                    <Spinner className="h-4 w-4 shrink-0 text-pending" />
                  ) : null}
                  <p className="font-mono text-xs text-muted">{question.id}</p>
                  {state?.verdict && !state.pending ? (
                    <PassFailBadge passed={state.verdict.passed} size="sm" />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void generateOne(question)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateAndEvaluate(question)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Generate + evaluate
                  </button>
                  {state?.generated ? (
                    <button
                      type="button"
                      onClick={() =>
                        void runOne(
                          question,
                          newCampaignId(),
                          undefined,
                          undefined,
                          state.generated,
                        )
                      }
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Evaluate generated
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void runOne(question)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {state?.pending ? <Spinner className="h-3.5 w-3.5" /> : null}
                    {state?.pending ? "Working…" : "Evaluate canned"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <Field label="Input / question">
                  {question.context?.trim() || (
                    <span className="text-muted">No question provided</span>
                  )}
                </Field>
                <Field
                  label={
                    state?.generated
                      ? "Judged text (generated)"
                      : "Judged text (canned)"
                  }
                >
                  {state?.generated ?? question.subject}
                </Field>
                <Field label="Expected facts">
                  {question.reference?.trim() || (
                    <span className="text-muted">No expected facts</span>
                  )}
                </Field>
              </div>

              {state?.pending ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm text-pending">
                  <Spinner className="h-4 w-4" />
                  {state.phase === "generating"
                    ? `Generating ${question.id}…`
                    : `Evaluating ${question.id}…`}
                </p>
              ) : null}
              {state?.error ? (
                <p className="mt-3 rounded-lg border border-fail/30 bg-fail-bg px-3 py-2 text-sm text-fail">
                  {state.error}
                </p>
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
