import { type ReactNode } from "react";
import { cn } from "@/app/_lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-200 bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div aria-hidden="true" className="text-neutral-400">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold text-neutral-800">{title}</h2>
      {description && <p className="max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
