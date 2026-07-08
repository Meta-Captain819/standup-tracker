import { requireSession } from "@/app/_lib/session/read";
import { AppSidebar } from "@/app/(app)/_components/AppSidebar";
import { AppHeader } from "@/app/(app)/_components/AppHeader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AppSidebar name={session.name} role={session.role} />
      <div className="flex flex-1 flex-col min-w-0">
        <AppHeader />
        <main className="flex flex-1 flex-col bg-calm-base p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
