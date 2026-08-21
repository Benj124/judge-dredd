"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "w-full rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-[15px] leading-6 text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
