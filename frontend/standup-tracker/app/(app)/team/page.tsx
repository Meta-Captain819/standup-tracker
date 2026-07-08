import { requireSession } from "@/app/_lib/session/read";
import { EmptyState } from "@/app/_components/EmptyState";
import { OutOfRoleScreen } from "@/app/(app)/_components/OutOfRoleScreen";

export default async function TeamPage() {
  // Real, server-side role gating (CLAUDE.md: role-correct rendering is server-side, never CSS-hidden) —
  // a member gets a different render tree entirely, not a hidden admin panel.
  const session = await requireSession();

  if (session.role === "MEMBER") {
    return <OutOfRoleScreen />;
  }

  return (
    <EmptyState
      title="Team management is coming in a later phase"
      description="Roster controls (invite, role changes, removal) are built in Phase 12."
    />
  );
}
