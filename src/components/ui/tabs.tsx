"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex flex-wrap gap-1.5 rounded-2xl border border-border bg-surface/90 p-2 shadow-[0_20px_50px_-32px_rgba(28,20,10,0.45)] sm:p-2.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-w-[9.5rem] flex-1 rounded-xl px-3.5 py-2.5 text-left transition sm:flex-none",
        "bg-transparent text-foreground outline-none",
        "hover:bg-surface-muted/80",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "data-[state=active]:bg-accent data-[state=active]:text-accent-fg data-[state=active]:shadow-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "data-[state=inactive]:hidden",
        className,
      )}
      // Keep panels mounted so client state (forms) survives tab switches.
      forceMount
      {...props}
    />
  );
}
