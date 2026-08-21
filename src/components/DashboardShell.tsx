"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DashboardTabId =
  | "fixtures"
  | "playground"
  | "history"
  | "batch"
  | "rubrics"
  | "agent"
  | "synthesize";

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
  {
    id: "synthesize",
    label: "Synthesize",
    hint: "Questions from stored full-text docs",
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
      <Tabs
        value={active}
        onValueChange={(value) => setActive(value as DashboardTabId)}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label="Dashboard flows">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              className="group"
            >
              <span className="block text-sm font-semibold leading-tight">
                {tab.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted group-data-[state=active]:text-accent-fg/85">
                {tab.hint}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <p className="px-1 text-sm text-muted">
          <span className="font-medium text-foreground">{activeMeta.label}</span>
          {" · "}
          {activeMeta.hint}
        </p>

        {TABS.map((tab) => (
          <TabsContent
            key={tab.id}
            value={tab.id}
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            forceMount
          >
            {panels[tab.id]}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
