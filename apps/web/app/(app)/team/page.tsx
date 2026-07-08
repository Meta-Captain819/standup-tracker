import { z } from "zod";
import { OutOfRoleScreen } from "@/app/(app)/_components/OutOfRoleScreen";
import { RosterControls } from "@/app/(app)/team/RosterControls";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { requireSession } from "@/app/_lib/session/read";
import { rosterMemberSchema } from "@/app/_lib/validation/responses";

export default async function TeamPage() {
  const session = await requireSession();

  if (session.role !== "OWNER_ADMIN") {
    return <OutOfRoleScreen />;
  }

  const members = await authorizedApiFetch("/teams/members", {
    schema: z.array(rosterMemberSchema),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Roster controls</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Removing a member revokes access immediately while keeping their standup history.
        </p>
      </div>
      <RosterControls initialMembers={members} />
    </div>
  );
}

