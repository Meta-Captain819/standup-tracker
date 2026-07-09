import { Badge } from "@/app/_components/Badge";
import { Card } from "@/app/_components/Card";
import { LocalDayTimeLabel } from "@/app/_components/LocalDayTimeLabel";
import { NameLabel } from "@/app/_components/NameLabel";
import { cn } from "@/app/_lib/cn";
import type { BoardStandup, Standup } from "@/app/_lib/validation/responses";
import type { Role } from "@/app/_lib/types/role";

export function StandupText({ update }: { update: Standup | BoardStandup }) {
  const hasBlocker = update.blockers.trim() !== "";

  return (
    <div className="grid gap-3 text-sm text-neutral-700">
      <section>
        <h3 className="font-medium text-neutral-900">Yesterday</h3>
        <p className="mt-1 whitespace-pre-wrap">{update.yesterday || "No update."}</p>
      </section>
      <section>
        <h3 className="font-medium text-neutral-900">Today</h3>
        <p className="mt-1 whitespace-pre-wrap">{update.today || "No update."}</p>
      </section>
      <section className={cn(hasBlocker && "rounded-lg bg-blocker-accent-bg p-3")}>
        <h3 className={cn("font-medium", hasBlocker ? "text-blocker-700" : "text-neutral-900")}>Blockers</h3>
        <p className={cn("mt-1 whitespace-pre-wrap", hasBlocker && "text-blocker-700")}>
          {update.blockers || "No blockers."}
        </p>
      </section>
    </div>
  );
}

export function StandupCard({ update, title }: { update: Standup; title?: string }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {title && <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>}
          <LocalDayTimeLabel isoTimestamp={update.submittedAtUtc} timezone={update.timezone} />
        </div>
        {update.editedAt && <Badge variant="edited">Edited</Badge>}
      </div>
      <StandupText update={update} />
      {update.editedAt && (
        <p className="text-xs text-edited-600">
          Updated <LocalDayTimeLabel isoTimestamp={update.editedAt} timezone={update.timezone} mode="full" />
        </p>
      )}
    </Card>
  );
}

export function TeamUpdateCard({
  name,
  role,
  status,
  update,
  noUpdateLabel = "No update yet",
  hasCurrentUpdate = true,
}: {
  name: string;
  role: Role;
  status: "pending" | "active";
  update: BoardStandup | null;
  noUpdateLabel?: string;
  hasCurrentUpdate?: boolean;
}) {
  const hasBlocker = !!update?.blockers.trim();

  return (
    <Card className={hasBlocker ? "border-blocker-300 bg-blocker-accent-bg/40" : undefined}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <NameLabel name={name} role={role} />
        {update ? (
          !hasCurrentUpdate ? (
            <Badge variant="noUpdate">{noUpdateLabel}</Badge>
          ) : hasBlocker ? (
            <Badge variant="blocker">Blocker</Badge>
          ) : (
            <Badge variant="onTrack">On track</Badge>
          )
        ) : (
          <Badge variant="noUpdate">{status === "pending" ? "Invite pending" : noUpdateLabel}</Badge>
        )}
      </div>
      {update ? (
        <>
          <LocalDayTimeLabel isoTimestamp={update.submittedAtUtc} timezone={update.timezone} className="mb-3 block" />
          <StandupText update={update} />
          {update.editedAt && (
            <Badge variant="edited" className="mt-4">
              Edited
            </Badge>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">This person has no matching update for this view.</p>
      )}
    </Card>
  );
}
