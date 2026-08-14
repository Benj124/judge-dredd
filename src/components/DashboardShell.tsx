"use client";

import { useState, type ReactNode } from "react";

export type DashboardTabId =
  | "fixtures"
  | "playground"
  | "history"
  | "batch"
  | "rubrics"
  | "agent";

const TABS: Array<{ id: DashboardTabId; label: string; hint: string }> = [
  {
    id: "fixtures",
    label: "Fixture questions",
    hint: "Run the committed evaluation set",
  },
  {
    id: "playground",
    label: "Playground",
    hint: "Ad-hoc subject evaluate",
  },
  {
    id: "history",
    label: "Run history",
    hint: "Filter and open stored evaluate runs",
  },
  {
    id: "batch",
    label: "Batch + compare",
    hint: "JSONL/CSV upload and A vs B deltas",
  },
  {
    id: "rubrics",
    label: "Evaluation Prompts",
    hint: "Create and edit evaluation prompts",
  },
  {
    id: "agent",
    label: "Agent options",
    hint: "Judge model and agent knobs",
  },
];

export function DashboardShell({
  panels,
}: {
  panels: Record<DashboardTabId, ReactNode>;
}) {
  const [active, setActive] = useState<DashboardTabId>("fixtures");
  const activeMeta = TABS.find((tab) => tab.id === active) ?? TABS[0];

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-surface/90 p-2 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-2.5">
        <div
          role="tablist"
          aria-label="Dashboard flows"
          className="flex flex-wrap gap-1.5"
        >
          {TABS.map((tab) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={[
                  "min-w-[9.5rem] flex-1 rounded-xl px-3.5 py-2.5 text-left transition sm:flex-none",
                  selected
                    ? "bg-accent text-accent-fg shadow-sm"
                    : "bg-transparent text-foreground hover:bg-surface-muted/80",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold leading-tight">
                  {tab.label}
                </span>
                <span
                  className={[
                    "mt-0.5 block text-[11px] leading-snug",
                    selected ? "text-accent-fg/85" : "text-muted",
                  ].join(" ")}
                >
                  {tab.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="px-1 text-sm text-muted">
        <span className="font-medium text-foreground">{activeMeta.label}</span>
        {" · "}
        {activeMeta.hint}
      </p>

      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={!selected}
            className={selected ? "block" : "hidden"}
          >
            {panels[tab.id]}
          </div>
        );
      })}
    </section>
  );
}
