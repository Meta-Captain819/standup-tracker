"use client";

import { type TextareaHTMLAttributes } from "react";
import { cn } from "@/app/_lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid = false, rows = 4, className, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full resize-y rounded-lg border bg-surface px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400",
        "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand-500",
        "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400",
        invalid ? "border-blocker-500" : "border-neutral-200",
        className,
      )}
      {...props}
    />
  );
}
