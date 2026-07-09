"use client";

import { usePathname } from "next/navigation";
import { SignOutButton } from "@/app/(app)/_components/SignOutButton";

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
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-neutral-200 bg-surface/80 px-4 py-4 backdrop-blur sm:px-6 md:px-8">
      <h1 className="text-xl font-semibold text-neutral-800">{title}</h1>
      <SignOutButton />
    </header>
  );
}
