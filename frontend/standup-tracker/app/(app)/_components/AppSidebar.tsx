"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NameLabel } from "@/app/_components/NameLabel";
import { cn } from "@/app/_lib/cn";
import type { Role } from "@/app/_lib/types/role";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/team", label: "Team" },
  { href: "/account", label: "Account" },
];

export interface AppSidebarProps {
  name: string;
  role: Role;
}

export function AppSidebar({ name, role }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col justify-between bg-neutral-900 px-4 py-6">
      <div className="flex flex-col gap-6">
        <span className="px-2 text-base font-semibold text-white">Standup Tracker</span>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-medium transition-colors",
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
      <div className="border-t border-neutral-800 px-2 pt-4">
        <NameLabel name={name} role={role} tone="onDark" />
      </div>
    </aside>
  );
}
