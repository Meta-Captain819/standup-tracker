import { type ReactNode } from "react";
import { InlineError } from "@/app/_components/InlineError";
import { cn } from "@/app/_lib/cn";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-700">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-blocker-accent">
            *
          </span>
        )}
      </label>
      {children}
      {error ? <InlineError message={error} /> : hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}
