import { AgenticOptionsForm } from "@/components/AgenticOptionsForm";
import { BatchComparePanel } from "@/components/BatchComparePanel";
import { DashboardShell } from "@/components/DashboardShell";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PlaygroundForm } from "@/components/PlaygroundForm";
import { QuestionDashboard } from "@/components/QuestionDashboard";
import { RubricEditor } from "@/components/RubricEditor";
import { SynthesizePanel } from "@/components/SynthesizePanel";
import { listDatasetRows, loadEvalCsv } from "@/lib/db/dataset";
import { loadQuestions } from "@/lib/eval/questions";
import { listAllRubrics } from "@/lib/eval/rubrics";
import { listTextDocumentSummaries } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const questions = loadQuestions();
  let csvJobs = await listDatasetRows().catch(() => []);
  if (csvJobs.length === 0) {
    try {
      csvJobs = loadEvalCsv("eval_data.csv").map((job) => ({
        ...job,
        sourceFile: "eval_data.csv",
      }));
    } catch {
      csvJobs = [];
    }
  }
  const rubrics = (await listAllRubrics()).map((rubric) => ({
    id: rubric.id,
    name: rubric.name,
    description: rubric.description,
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      scale: criterion.scale,
    })),
  }));
  const textDocuments = await listTextDocumentSummaries().catch(() => []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border/80 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-sm font-semibold text-accent-fg">
              JD
            </span>
            <div>
              <p className="font-display text-xl leading-none tracking-tight">
                Judge Dredd
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                Internal evaluation
              </p>
            </div>
          </div>
          <p className="hidden text-sm text-muted sm:block">Dashboard</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
            Judge the work. Tune the rules.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">
            Tabbed flows for fixtures, ad-hoc evaluate, evaluation prompts,
            agent options, and question synthesis — with pass and fail marked
            clearly on every verdict.
          </p>
        </div>
        <DashboardShell
          panels={{
            fixtures: (
              <QuestionDashboard
                questions={questions}
                csvJobs={csvJobs.map((job) => ({
                  id: job.id,
                  title: job.id,
                  subject: job.subject,
                  context: job.context,
                  reference: job.reference,
                }))}
              />
            ),
            playground: <PlaygroundForm rubrics={rubrics} />,
            history: <HistoryPanel />,
            batch: <BatchComparePanel />,
            rubrics: <RubricEditor />,
            agent: <AgenticOptionsForm />,
            synthesize: (
              <SynthesizePanel
                documents={textDocuments.map((doc) => ({
                  id: doc.id,
                  slug: doc.slug,
                  title: doc.title,
                  canonicalUrl: doc.canonicalUrl,
                  site: doc.site,
                  charCount: doc.charCount,
                }))}
              />
            ),
          }}
        />
      </main>
    </div>
  );
}
