import { cn } from "@/app/_lib/cn";
import type { Role } from "@/app/_lib/types/role";

export interface NameLabelProps {
  name: string;
  role?: Role;
  compact?: boolean;
  /** "onDark" swaps text colors for use on a dark surface (e.g. the app sidebar). */
  tone?: "default" | "onDark";
  className?: string;
}

const CIRCLE_ROTATION = [
  "bg-brand-100 text-brand-700",
  "bg-neutral-100 text-neutral-700",
  "bg-edited-50 text-edited-600",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER_ADMIN: "Admin",
  LEAD: "Lead",
  MEMBER: "Member",
};

export function NameLabel({ name, role, compact = false, tone = "default", className }: NameLabelProps) {
  const circleClasses = CIRCLE_ROTATION[hashName(name) % CIRCLE_ROTATION.length];
  const nameClasses = tone === "onDark" ? "text-white" : "text-neutral-800";
  const roleClasses = tone === "onDark" ? "text-neutral-400" : "text-neutral-500";

  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      {!compact && (
        <span
          aria-hidden="true"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            circleClasses,
          )}
        >
          {initialsFor(name)}
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate text-sm font-medium", nameClasses)}>{name}</span>
        {role && <span className={cn("text-xs", roleClasses)}>{ROLE_LABEL[role]}</span>}
      </span>
    </span>
  );
}
