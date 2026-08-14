import { formatOverall, formatScoreOnScale, scalePercent } from "@/lib/eval/format";
import { PassFailBadge } from "./PassFailBadge";

export type VerdictView = {
  rubricId: string;
  rubricVersion: string;
  scores: Array<{ id: string; score: number; rationale?: string }>;
  overall: number;
  passed: boolean | null;
  rationale: string;
};

export type RubricScale = {
  id: string;
  name: string;
  scale: { min: number; max: number };
};

export function VerdictPanel({
  pending,
  error,
  verdict,
  criteria,
}: {
  pending: boolean;
  error: string | null;
  verdict: VerdictView | null;
  criteria: RubricScale[];
}) {
  return (
    <section
      aria-live="polite"
      className="flex min-h-[32rem] flex-col rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Results
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">Verdict</h2>
        </div>
        {verdict && !pending && !error ? (
          <PassFailBadge passed={verdict.passed} />
        ) : null}
      </div>

      {pending ? <PendingState /> : null}
      {!pending && error ? <ErrorState message={error} /> : null}
      {!pending && !error && !verdict ? <EmptyState /> : null}
      {!pending && !error && verdict ? (
        <VerdictBody verdict={verdict} criteria={criteria} />
      ) : null}
    </section>
  );
}

function VerdictBody({
  verdict,
  criteria,
}: {
  verdict: VerdictView;
  criteria: RubricScale[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-end justify-between gap-4 rounded-xl bg-surface-muted/70 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Overall score
          </p>
          <p className="font-display text-5xl leading-none tracking-tight text-foreground">
            {formatOverall(verdict.overall)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 pb-1">
          <PassFailBadge passed={verdict.passed} size="sm" />
          <p className="text-right text-xs text-muted">
            Prompt {verdict.rubricId}
            <span className="block">v{verdict.rubricVersion}</span>
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-4">
        {verdict.scores.map((score) => {
          const meta = criteria.find((criterion) => criterion.id === score.id);
          const min = meta?.scale.min ?? 1;
          const max = meta?.scale.max ?? 5;
          const width = scalePercent(score.score, min, max);
          return (
            <li key={score.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium capitalize">
                  {meta?.name ?? score.id}
                </span>
                <span className="font-mono text-xs text-muted">
                  {formatScoreOnScale(score.score, max)}
                </span>
              </div>
              <div className="score-bar h-1.5 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="text-sm leading-6 text-muted">
                {score.rationale?.trim() || "No criterion rationale."}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto rounded-xl border border-border/80 bg-background/40 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Overall rationale
        </p>
        <p className="mt-2 text-sm leading-6">{verdict.rationale}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/40 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border font-display text-lg text-muted">
        ∅
      </span>
      <p className="font-medium">No verdict yet</p>
      <p className="max-w-xs text-sm leading-6 text-muted">
        Submit a subject to run the judge. Scores, pass/fail, and rationales
        will land here.
      </p>
    </div>
  );
}

function PendingState() {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <p className="text-sm text-pending">Evaluating against the prompt…</p>
      <div className="pending-pulse h-24 rounded-xl bg-surface-muted" />
      <div className="pending-pulse h-3 rounded-full bg-surface-muted" />
      <div className="pending-pulse h-3 w-4/5 rounded-full bg-surface-muted" />
      <div className="pending-pulse h-3 w-2/3 rounded-full bg-surface-muted" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-fail/30 bg-fail-bg px-5 py-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fail">
        Evaluate failed
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">{message}</p>
    </div>
  );
}
