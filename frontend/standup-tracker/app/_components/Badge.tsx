import { type ReactNode } from "react";
import { cn } from "@/app/_lib/cn";

export type BadgeVariant = "blocker" | "noUpdate" | "edited" | "onTrack" | "neutral";

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  /** Compact colored dot instead of a full pill — for inline use next to a NameLabel in dense lists. */
  dot?: boolean;
  className?: string;
}

const pillClasses: Record<BadgeVariant, string> = {
  blocker: "bg-blocker-accent-bg text-blocker-700",
  noUpdate: "bg-no-update-muted-bg text-neutral-600",
  edited: "bg-edited-subtle-bg text-edited-600",
  onTrack: "bg-on-track-neutral-bg text-on-track-neutral",
  neutral: "bg-neutral-100 text-neutral-700",
};

const dotClasses: Record<BadgeVariant, string> = {
  blocker: "bg-blocker-accent",
  noUpdate: "bg-no-update-muted",
  edited: "bg-edited-subtle",
  onTrack: "bg-on-track-neutral",
  neutral: "bg-neutral-400",
};

export function Badge({ variant, children, dot = false, className }: BadgeProps) {
  if (dot) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-neutral-600", className)}>
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", dotClasses[variant])} />
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium",
        pillClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
