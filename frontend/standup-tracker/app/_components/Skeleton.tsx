import { cn } from "@/app/_lib/cn";

type SkeletonRadius = "sm" | "md" | "lg" | "2xl" | "pill";

export interface SkeletonProps {
  width?: string;
  height?: string;
  rounded?: SkeletonRadius;
  className?: string;
}

const roundedClasses: Record<SkeletonRadius, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  "2xl": "rounded-2xl",
  pill: "rounded-pill",
};

export function Skeleton({ width = "100%", height = "1rem", rounded = "md", className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={{ width, height }}
      className={cn("animate-pulse bg-neutral-200", roundedClasses[rounded], className)}
    />
  );
}
