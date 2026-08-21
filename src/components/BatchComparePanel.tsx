"use client";

import { useState } from "react";
import { parseBatchJobs } from "@/lib/eval/batchParse";
import { compareEvaluateRuns, type CompareResult } from "@/lib/eval/compare";
import { formatOverall } from "@/lib/eval/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PassFailBadge } from "./PassFailBadge";

type EvaluateResponse =
  | { ok: true; verdict: { overall: number; passed: boolean | null }; runId?: string }
  | { ok: false; error: string };

type HistoryRun = {
  id: string;
  rubricVersion: string;
  verdict: {
    overall: number;
    passed: boolean | null;
    scores: Array<{ id: string; score: number }>;
    rationale: string;
    rubricId: string;
    rubricVersion: string;
  };
  rubricId: string;
};

export function BatchComparePanel() {
  const [paste, setPaste] = useState(
    '{"id":"a1","subject":"Paris is the capital of France."}\n{"id":"a2","subject":"Water boils at 50 C at 1 atm."}',
  );
  const [format, setFormat] = useState<"jsonl" | "csv">("jsonl");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<
    Array<{ id: string; subject: string; overall: number | null; passed: boolean | null; runId?: string }>
  >([]);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [compare, setCompare] = useState<CompareResult | null>(null);

  async function loadDataset() {
    setError(null);
    try {
      const response = await fetch("/api/dataset");
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        jobs?: Array<{
          id: string;
          subject: string;
          context?: string;
          reference?: string;
        }>;
      };
      if (!data.ok || !data.jobs?.length) {
        setError(data.error ?? "No dataset rows in the database. Run npm run etl:eval-data.");
        return;
      }
      setFormat("jsonl");
      setPaste(
        data.jobs
          .map((job) => JSON.stringify(job))
          .join("\n"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dataset");
    }
  }

  function onFile(file: File) {
    void file.text().then((text) => {
      setPaste(text);
      if (file.name.endsWith(".csv")) setFormat("csv");
      if (file.name.endsWith(".jsonl") || file.name.endsWith(".json")) {
        setFormat("jsonl");
      }
    });
  }

  async function runBatch() {
    setBusy(true);
    setError(null);
    setCompare(null);
    try {
      const jobs = parseBatchJobs(paste, format);
      const campaignId = crypto.randomUUID();
      setBatchId(campaignId);
      const next: typeof rows = [];
      for (const job of jobs) {
        const response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: job.subject,
            context: job.context,
            reference: job.reference,
            rubricId: "default",
            fixtureId: job.id,
            campaignId,
            useRetrieval: false,
          }),
        });
        const data = (await response.json()) as EvaluateResponse;
        next.push({
          id: job.id,
          subject: job.subject,
          overall: data.ok ? data.verdict.overall : null,
          passed: data.ok ? data.verdict.passed : null,
          runId: data.ok ? data.runId : undefined,
        });
      }
      setRows(next);
      const first = next.find((row) => row.runId);
      const second = next.filter((row) => row.runId)[1];
      if (first?.runId) setRunA(first.runId);
      if (second?.runId) setRunB(second.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch failed");
    } finally {
      setBusy(false);
    }
  }

  async function runCompare() {
    setError(null);
    setCompare(null);
    if (!runA.trim() || !runB.trim()) {
      setError("Enter two persisted run ids to compare.");
      return;
    }
    const [aRes, bRes] = await Promise.all([
      fetch(`/api/runs/${runA.trim()}`),
      fetch(`/api/runs/${runB.trim()}`),
    ]);
    const aBody = (await aRes.json()) as { ok: boolean; run?: HistoryRun; error?: string };
    const bBody = (await bRes.json()) as { ok: boolean; run?: HistoryRun; error?: string };
    if (!aBody.ok || !aBody.run || !bBody.ok || !bBody.run) {
      setError(aBody.error ?? bBody.error ?? "Could not load both runs");
      return;
    }
    setCompare(
      compareEvaluateRuns(
        {
          id: aBody.run.id,
          createdAt: "",
          subject: "",
          context: null,
          reference: null,
          campaignId: null,
          fixtureId: null,
          rubricId: aBody.run.rubricId,
          rubricVersion: aBody.run.rubricVersion,
          verdict: aBody.run.verdict,
        },
        {
          id: bBody.run.id,
          createdAt: "",
          subject: "",
          context: null,
          reference: null,
          campaignId: null,
          fixtureId: null,
          rubricId: bBody.run.rubricId,
          rubricVersion: bBody.run.rubricVersion,
          verdict: bBody.run.verdict,
        },
      ),
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Batch
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">
          Upload and compare
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Paste or upload JSONL/CSV, run a batch through evaluate, then compare
          two persisted runs side by side.
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => void loadDataset()}
        disabled={busy}
      >
        Load eval_data.csv from database
      </Button>

      <Label>
        <span>Upload JSONL or CSV</span>
        <Input
          type="file"
          accept=".jsonl,.json,.csv,text/csv,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </Label>

      <Label>
        <span>Paste JSONL or CSV</span>
        <Textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={6}
          className="font-mono text-sm"
        />
      </Label>

      <Label>
        <span>Format</span>
        <Select
          value={format}
          onChange={(event) => setFormat(event.target.value as "jsonl" | "csv")}
        >
          <option value="jsonl">JSONL</option>
          <option value="csv">CSV</option>
        </Select>
      </Label>

      <Button
        type="button"
        onClick={() => void runBatch()}
        disabled={busy}
      >
        {busy ? "Running batch…" : "Run batch"}
      </Button>

      {batchId ? (
        <p className="font-mono text-xs text-muted">campaign {batchId}</p>
      ) : null}

      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="border-0">
              <TableHead className="py-1">Id</TableHead>
              <TableHead className="py-1">Overall</TableHead>
              <TableHead className="py-1">Pass/fail</TableHead>
              <TableHead className="py-1">Run id</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="py-1 font-mono text-xs">{row.id}</TableCell>
                <TableCell className="py-1">
                  {row.overall === null ? "—" : formatOverall(row.overall)}
                </TableCell>
                <TableCell className="py-1">
                  {row.overall === null ? (
                    "—"
                  ) : (
                    <PassFailBadge passed={row.passed} size="sm" />
                  )}
                </TableCell>
                <TableCell className="py-1 font-mono text-xs">
                  {row.runId ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Label>
          <span>Compare A (run id)</span>
          <Input
            value={runA}
            onChange={(event) => setRunA(event.target.value)}
            className="font-mono text-sm"
          />
        </Label>
        <Label>
          <span>Compare B (run id)</span>
          <Input
            value={runB}
            onChange={(event) => setRunB(event.target.value)}
            className="font-mono text-sm"
          />
        </Label>
      </div>
      <Button type="button" variant="secondary" onClick={() => void runCompare()}>
        Compare A vs B
      </Button>

      {compare ? (
        <div className="rounded-xl border border-border bg-background/50 p-4">
          <h3 className="font-display text-xl">A vs B</h3>
          <p className="mt-2 text-sm">
            Overall {formatOverall(compare.a.overall)} →{" "}
            {formatOverall(compare.b.overall)} (delta{" "}
            {compare.overallDelta.toFixed(2)})
          </p>
          <p className="mt-1 text-xs text-muted">
            Rubric versions A {compare.rubricVersions.a} · B{" "}
            {compare.rubricVersions.b}
          </p>
          <ul className="mt-3 text-sm">
            {compare.criterionDeltas.map((item) => (
              <li key={item.id}>
                {item.id}: {item.a ?? "—"} → {item.b ?? "—"} (
                {item.delta === null ? "—" : item.delta.toFixed(2)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-sm text-fail">{error}</p> : null}
    </section>
  );
}
