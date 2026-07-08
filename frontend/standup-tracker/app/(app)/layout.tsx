import { requireSession } from "@/app/_lib/session/read";
import { AppSidebar } from "@/app/(app)/_components/AppSidebar";
import { AppHeader } from "@/app/(app)/_components/AppHeader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real, non-optimistic auth gate for this route group — proxy.ts's check is a UX shortcut only.
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <AppSidebar name={session.name} role={session.role} />
      <div className="flex flex-1 flex-col">
        <AppHeader />
        <main className="flex flex-1 flex-col bg-calm-base p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
