import Link from "next/link";
import { notFound } from "next/navigation";
import { PassFailBadge } from "@/components/PassFailBadge";
import { getEvaluateRun } from "@/lib/db/store";
import { formatOverall } from "@/lib/eval/format";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getEvaluateRun(id);
  if (!run) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href="/history" className="text-sm text-muted underline">
        ← Run history
      </Link>
      <h1 className="font-display text-3xl tracking-tight">Evaluate run</h1>
      <p className="font-mono text-xs text-muted">{run.id}</p>
      <p className="text-sm leading-6">
        <span className="text-muted">Subject · </span>
        {run.subject}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PassFailBadge passed={run.verdict.passed} />
        <span>Overall {formatOverall(run.verdict.overall)}</span>
        <span className="text-sm text-muted">Rubric {run.rubricId}</span>
      </div>
      <p className="text-xs text-muted">
        {run.verdict.scores
          .map((score) => `${score.id} ${score.score}`)
          .join(" · ")}
      </p>
      <p className="text-sm leading-6">{run.verdict.rationale}</p>
    </div>
  );
}
