"use client";

import { useCallback, useEffect, useState } from "react";

export type EditableCriterion = {
  id: string;
  name: string;
  description: string;
  scaleMin: number;
  scaleMax: number;
  weight: number;
  passThreshold: string;
};

export type EditableRubric = {
  id: string;
  version: string;
  name: string;
  description: string;
  overallPassRule: "weighted_average" | "all_must_pass";
  overallPassThreshold: string;
  criteria: EditableCriterion[];
};

type ListedRubric = {
  id: string;
  version: string;
  name: string;
  description: string;
  overallPassRule: "weighted_average" | "all_must_pass";
  overallPassThreshold?: number;
  criteria: Array<{
    id: string;
    name: string;
    description: string;
    scale: { min: number; max: number };
    weight: number;
    passThreshold?: number;
  }>;
};

function emptyCriterion(): EditableCriterion {
  return {
    id: "",
    name: "",
    description: "",
    scaleMin: 1,
    scaleMax: 5,
    weight: 1,
    passThreshold: "3",
  };
}

function emptyRubric(): EditableRubric {
  return {
    id: "",
    version: "1",
    name: "",
    description: "",
    overallPassRule: "weighted_average",
    overallPassThreshold: "3",
    criteria: [emptyCriterion()],
  };
}

function toEditable(rubric: ListedRubric): EditableRubric {
  return {
    id: rubric.id,
    version: rubric.version,
    name: rubric.name,
    description: rubric.description,
    overallPassRule: rubric.overallPassRule,
    overallPassThreshold:
      rubric.overallPassThreshold !== undefined
        ? String(rubric.overallPassThreshold)
        : "",
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      description: criterion.description,
      scaleMin: criterion.scale.min,
      scaleMax: criterion.scale.max,
      weight: criterion.weight,
      passThreshold:
        criterion.passThreshold !== undefined
          ? String(criterion.passThreshold)
          : "",
    })),
  };
}

function toPayload(draft: EditableRubric) {
  return {
    id: draft.id.trim(),
    version: draft.version.trim(),
    name: draft.name.trim(),
    description: draft.description,
    overallPassRule: draft.overallPassRule,
    ...(draft.overallPassThreshold.trim()
      ? { overallPassThreshold: Number(draft.overallPassThreshold) }
      : {}),
    criteria: draft.criteria.map((criterion) => ({
      id: criterion.id.trim(),
      name: criterion.name.trim(),
      description: criterion.description,
      scale: { min: Number(criterion.scaleMin), max: Number(criterion.scaleMax) },
      weight: Number(criterion.weight),
      ...(criterion.passThreshold.trim()
        ? { passThreshold: Number(criterion.passThreshold) }
        : {}),
    })),
  };
}

const fieldClass =
  "w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60";

export function RubricEditor() {
  const [rubrics, setRubrics] = useState<ListedRubric[]>([]);
  const [draft, setDraft] = useState<EditableRubric>(emptyRubric);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rubrics");
      const data = (await response.json()) as {
        ok: boolean;
        rubrics?: ListedRubric[];
        error?: string;
      };
      if (!data.ok || !data.rubrics) {
        setError(data.error ?? "Failed to load evaluation prompts");
        return;
      }
      setRubrics(data.rubrics);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load evaluation prompts",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function selectRubric(id: string) {
    const found = rubrics.find((rubric) => rubric.id === id);
    if (!found) return;
    setDraft(toEditable(found));
    setNotice(null);
    setError(null);
  }

  function patchDraft(partial: Partial<EditableRubric>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function patchCriterion(
    index: number,
    partial: Partial<EditableCriterion>,
  ) {
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, i) =>
        i === index ? { ...criterion, ...partial } : criterion,
      ),
    }));
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(draft)),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        rubric?: ListedRubric;
      };
      if (!data.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setNotice(
        `Saved evaluation prompt “${data.rubric?.name ?? draft.name}”.`,
      );
      await load();
      if (data.rubric) {
        setDraft(toEditable(data.rubric));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Evaluation prompts
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">
            Edit evaluation prompts
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Built-in default stays read-only. Create custom evaluation prompts;
            they persist in local Postgres and appear in the playground.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(emptyRubric());
            setNotice(null);
            setError(null);
          }}
          className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted"
        >
          New evaluation prompt
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="rounded-xl border border-border/80 bg-background/40 p-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Saved
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {rubrics.map((rubric) => {
                const isDefault = rubric.id === "default";
                return (
                  <li key={rubric.id}>
                    <button
                      type="button"
                      onClick={() => selectRubric(rubric.id)}
                      className={[
                        "w-full rounded-lg px-2.5 py-2 text-left text-sm transition",
                        draft.id === rubric.id
                          ? "bg-accent/15 font-medium text-foreground"
                          : "hover:bg-surface-muted",
                      ].join(" ")}
                    >
                      <span className="block truncate">{rubric.name}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted">
                        {rubric.id}
                        {isDefault ? " · built-in" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form onSubmit={(event) => void onSave(event)} className="flex flex-col gap-4">
          {draft.id === "default" ? (
            <p className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm text-muted">
              The built-in default evaluation prompt is view-only. Copy fields
              into a new id to customize.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Id</span>
              <input
                className={fieldClass}
                required
                disabled={saving || draft.id === "default"}
                value={draft.id}
                onChange={(event) => patchDraft({ id: event.target.value })}
                placeholder="my-prompt"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Version</span>
              <input
                className={fieldClass}
                required
                disabled={saving || draft.id === "default"}
                value={draft.version}
                onChange={(event) => patchDraft({ version: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Name</span>
              <input
                className={fieldClass}
                required
                disabled={saving || draft.id === "default"}
                value={draft.name}
                onChange={(event) => patchDraft({ name: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Description</span>
              <textarea
                className={fieldClass}
                rows={2}
                disabled={saving || draft.id === "default"}
                value={draft.description}
                onChange={(event) =>
                  patchDraft({ description: event.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Overall pass rule</span>
              <select
                className={fieldClass}
                disabled={saving || draft.id === "default"}
                value={draft.overallPassRule}
                onChange={(event) =>
                  patchDraft({
                    overallPassRule: event.target.value as EditableRubric["overallPassRule"],
                  })
                }
              >
                <option value="weighted_average">weighted_average</option>
                <option value="all_must_pass">all_must_pass</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Overall threshold{" "}
                <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                className={fieldClass}
                type="number"
                step="any"
                disabled={saving || draft.id === "default"}
                value={draft.overallPassThreshold}
                onChange={(event) =>
                  patchDraft({ overallPassThreshold: event.target.value })
                }
              />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Criteria</p>
              <button
                type="button"
                disabled={saving || draft.id === "default"}
                onClick={() =>
                  patchDraft({ criteria: [...draft.criteria, emptyCriterion()] })
                }
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                Add criterion
              </button>
            </div>
            {draft.criteria.map((criterion, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-border/80 bg-background/30 p-3 sm:grid-cols-2"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Id</span>
                  <input
                    className={fieldClass}
                    required
                    disabled={saving || draft.id === "default"}
                    value={criterion.id}
                    onChange={(event) =>
                      patchCriterion(index, { id: event.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Name</span>
                  <input
                    className={fieldClass}
                    required
                    disabled={saving || draft.id === "default"}
                    value={criterion.name}
                    onChange={(event) =>
                      patchCriterion(index, { name: event.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs text-muted">Description</span>
                  <input
                    className={fieldClass}
                    required
                    disabled={saving || draft.id === "default"}
                    value={criterion.description}
                    onChange={(event) =>
                      patchCriterion(index, { description: event.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Scale min</span>
                  <input
                    className={fieldClass}
                    type="number"
                    required
                    disabled={saving || draft.id === "default"}
                    value={criterion.scaleMin}
                    onChange={(event) =>
                      patchCriterion(index, {
                        scaleMin: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Scale max</span>
                  <input
                    className={fieldClass}
                    type="number"
                    required
                    disabled={saving || draft.id === "default"}
                    value={criterion.scaleMax}
                    onChange={(event) =>
                      patchCriterion(index, {
                        scaleMax: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Weight</span>
                  <input
                    className={fieldClass}
                    type="number"
                    step="any"
                    required
                    disabled={saving || draft.id === "default"}
                    value={criterion.weight}
                    onChange={(event) =>
                      patchCriterion(index, {
                        weight: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Pass threshold</span>
                  <input
                    className={fieldClass}
                    type="number"
                    step="any"
                    disabled={saving || draft.id === "default"}
                    value={criterion.passThreshold}
                    onChange={(event) =>
                      patchCriterion(index, {
                        passThreshold: event.target.value,
                      })
                    }
                  />
                </label>
                {draft.criteria.length > 1 && draft.id !== "default" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      patchDraft({
                        criteria: draft.criteria.filter((_, i) => i !== index),
                      })
                    }
                    className="sm:col-span-2 justify-self-start text-xs font-medium text-fail hover:underline"
                  >
                    Remove criterion
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {error ? <p className="text-sm text-fail">{error}</p> : null}
          {notice ? <p className="text-sm text-pass">{notice}</p> : null}

          <button
            type="submit"
            disabled={saving || draft.id === "default"}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save evaluation prompt"}
          </button>
        </form>
      </div>
    </section>
  );
}
