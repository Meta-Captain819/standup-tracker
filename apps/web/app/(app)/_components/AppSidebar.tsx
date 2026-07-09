"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NameLabel } from "@/app/_components/NameLabel";
import { cn } from "@/app/_lib/cn";
import type { Role } from "@/app/_lib/types/role";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", roles: ["OWNER_ADMIN", "LEAD", "MEMBER"] },
  { href: "/history", label: "History", roles: ["OWNER_ADMIN", "LEAD", "MEMBER"] },
  { href: "/team", label: "Team", roles: ["OWNER_ADMIN"] },
  
] satisfies Array<{ href: string; label: string; roles: Role[] }>;

export interface AppSidebarProps {
  name: string;
  role: Role;
}

export function AppSidebar({ name, role }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-full md:w-64 shrink-0 md:justify-between bg-neutral-900 px-4 py-4 md:py-6">
      <div className="flex flex-col gap-4 md:gap-8">
        <div className="flex items-center justify-between md:justify-start gap-2">
          <span className="flex items-center gap-2 px-1">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white"
            >
              S
            </span>
            <span className="text-base font-semibold text-white">Standup Tracker</span>
          </span>
          <div className="md:hidden">
            <NameLabel name={name} role={role} tone="onDark" compact />
          </div>
        </div>
        <nav className="flex flex-row md:flex-col gap-2 md:gap-1 overflow-x-auto pb-1 md:pb-0">
          {NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-500 text-white"
                    : "text-neutral-300 hover:bg-neutral-800 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="hidden md:block border-t border-neutral-800 px-1 pt-4">
        <NameLabel name={name} role={role} tone="onDark" />
      </div>
    </aside>
  );
}
