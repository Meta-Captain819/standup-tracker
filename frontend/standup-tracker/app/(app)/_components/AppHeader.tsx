"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/history": "History",
  "/team": "Team",
  "/account": "Account",
};

export function AppHeader() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Standup Tracker";

  return (
    <header className="border-b border-neutral-200 bg-surface px-6 py-4 sm:px-8">
      <h1 className="text-xl font-semibold text-neutral-800">{title}</h1>
    </header>
  );
}
