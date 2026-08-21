"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide",
  {
    variants: {
      tone: {
        pass: "border-pass/25 bg-pass-bg text-pass",
        fail: "border-fail/25 bg-fail-bg text-fail",
        neutral: "border-border bg-surface-muted text-muted",
        accent: "border-accent/25 bg-accent/10 text-accent",
      },
      size: {
        sm: "gap-1 px-2 py-0.5 text-[11px]",
        md: "gap-1.5 px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return (
    <span
      role="status"
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
