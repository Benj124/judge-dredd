"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_JUDGE_MODEL } from "@/lib/eval/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AgenticOptionsForm() {
  const [judgeModel, setJudgeModel] = useState(DEFAULT_JUDGE_MODEL);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agentic-options");
      const data = (await response.json()) as {
        ok: boolean;
        options?: { judgeModel: string; updatedAt?: string | null };
        error?: string;
      };
      if (!data.ok || !data.options) {
        setError(data.error ?? "Failed to load agent options");
        return;
      }
      setJudgeModel(data.options.judgeModel);
      setUpdatedAt(data.options.updatedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent options");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/agentic-options", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeModel }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        options?: { judgeModel: string; updatedAt?: string | null };
        error?: string;
      };
      if (!data.ok || !data.options) {
        setError(data.error ?? "Save failed");
        return;
      }
      setJudgeModel(data.options.judgeModel);
      setUpdatedAt(data.options.updatedAt ?? null);
      setNotice("Agent options saved. Evaluate uses this judge model.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Agent options
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">
          Judge configuration
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Settings stored in local Postgres and applied on every evaluate
          request. Prefer a low-cost non-frontier model.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading options…</p>
      ) : (
        <form onSubmit={(event) => void onSave(event)} className="flex max-w-xl flex-col gap-5">
          <Label htmlFor="judge-model">
            <span>Judge model</span>
            <Input
              id="judge-model"
              name="judgeModel"
              required
              disabled={saving}
              value={judgeModel}
              onChange={(event) => setJudgeModel(event.target.value)}
              placeholder={DEFAULT_JUDGE_MODEL}
            />
            <span className="text-xs font-normal leading-5 text-muted">
              Default when unset:{" "}
              <code className="font-mono">{DEFAULT_JUDGE_MODEL}</code>
            </span>
          </Label>

          {updatedAt ? (
            <p className="text-xs text-muted">
              Last saved{" "}
              <time dateTime={updatedAt}>
                {new Date(updatedAt).toLocaleString()}
              </time>
            </p>
          ) : null}

          {error ? <p className="text-sm text-fail">{error}</p> : null}
          {notice ? <p className="text-sm text-pass">{notice}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save options"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setJudgeModel(DEFAULT_JUDGE_MODEL)}
            >
              Reset to default model
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
