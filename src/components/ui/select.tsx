"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Styled native select using project theme tokens (works with forms without portal overhead). */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-[15px] leading-6 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
