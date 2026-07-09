"use client";

import { type InputHTMLAttributes } from "react";
import { cn } from "@/app/_lib/cn";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  type?: "text" | "email" | "password" | "date";
  invalid?: boolean;
}

export function TextField({ type = "text", invalid = false, className, ...props }: TextFieldProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-neutral-800 placeholder:text-neutral-400",
        "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand-500",
        "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400",
        invalid ? "border-blocker-500" : "border-neutral-200",
        className,
      )}
      {...props}
    />
  );
}
