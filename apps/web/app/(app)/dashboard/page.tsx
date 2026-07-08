import { z } from "zod";
import { EmptyState } from "@/app/_components/EmptyState";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { requireSession } from "@/app/_lib/session/read";
import {
  boardSchema,
  standupSchema,
  type LiveBoard,
} from "@/app/_lib/validation/responses";
import { StandupForm } from "@/app/(app)/_components/StandupForm";
import { StandupCard, TeamUpdateCard } from "@/app/(app)/_components/StandupUi";
import { LiveRefresh } from "@/app/(app)/_components/LiveRefresh";
import { AiSummarySlot } from "@/app/(app)/_components/AiSummarySlot";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function MemberHome({ timezone }: { timezone: string }) {
  const [today, recent] = await Promise.all([
    authorizedApiFetch("/standups/me/today", {
      searchParams: { timezone },
      schema: standupSchema.nullable(),
    }),
    authorizedApiFetch("/standups/me/recent", {
      schema: z.array(standupSchema),
    }),
  ]);

  const past = recent.filter((item) => item.id !== today?.id);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <StandupForm current={today} />
      </section>
      <aside className="space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900">Recent days</h2>
        {past.length === 0 ? (
          <EmptyState title="No recent updates yet" description="Your previous standups will appear here." />
        ) : (
          past.map((update) => <StandupCard key={update.id} update={update} />)
        )}
      </aside>
    </div>
  );
}

function LeadBoard({ board }: { board: LiveBoard }) {
  return (
    <div className="space-y-6">
      <LiveRefresh />
      <AiSummarySlot standupDate={todayDateString()} />
      {board.cards.length === 0 ? (
        <EmptyState title="No team members yet" description="Add members from Team to start collecting updates." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {board.cards.map((card) => (
            <TeamUpdateCard
              key={card.userId}
              name={card.name}
              role={card.role}
              status={card.status}
              update={card.latest}
              hasCurrentUpdate={card.hasPostedToday}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();

  if (session.role === "MEMBER") {
    return <MemberHome timezone={session.timezone || "UTC"} />;
  }

  const board = await authorizedApiFetch("/dashboard", { schema: boardSchema });
  return board.view === "live" ? <LeadBoard board={board} /> : null;
}
