import Link from "next/link";
import { EmptyState } from "@/app/_components/EmptyState";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { TextField } from "@/app/_components/TextField";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { requireSession } from "@/app/_lib/session/read";
import { dateBoardSchema, historyPageSchema } from "@/app/_lib/validation/responses";
import { StandupCard, TeamUpdateCard } from "@/app/(app)/_components/StandupUi";
import { AiSummarySlot } from "@/app/(app)/_components/AiSummarySlot";

function dateString(daysAgo = 1) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; date?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;

  if (session.role === "MEMBER") {
    const page = await authorizedApiFetch("/history/me", {
      searchParams: { cursor: query.cursor },
      schema: historyPageSchema,
    });

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Your history</h2>
          <p className="mt-1 text-sm text-neutral-500">Your own past updates, newest first.</p>
        </div>
        {page.items.length === 0 ? (
          <EmptyState title="No history yet" description="After you submit updates, they will appear here." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {page.items.map((item) => (
              <StandupCard key={item.id} update={item} />
            ))}
          </div>
        )}
        {page.nextCursor && (
          <Link href={`/history?cursor=${page.nextCursor}`}>
            <Button variant="secondary">Load older updates</Button>
          </Link>
        )}
      </div>
    );
  }

  const selectedDate = query.date ?? dateString();
  const board = await authorizedApiFetch("/history/team", {
    searchParams: { date: selectedDate },
    schema: dateBoardSchema,
  });

  return (
    <div className="space-y-6">
      <Card padding="sm">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/history">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-neutral-700">
            Team date
            <TextField type="date" name="date" defaultValue={selectedDate} max={dateString(0)} />
          </label>
          <Button type="submit">Show date</Button>
        </form>
      </Card>
      <AiSummarySlot standupDate={selectedDate} />
      {board.cards.length === 0 ? (
        <EmptyState title="No team members yet" description="There is no roster to show for this date." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {board.cards.map((card) => (
            <TeamUpdateCard
              key={card.userId}
              name={card.name}
              role={card.role}
              status={card.status}
              update={card.standup}
              hasCurrentUpdate={card.hasUpdate}
              noUpdateLabel="No update for date"
            />
          ))}
        </div>
      )}
    </div>
  );
}
