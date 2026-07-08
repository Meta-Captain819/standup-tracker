"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { FormField } from "@/app/_components/FormField";
import { InlineError } from "@/app/_components/InlineError";
import { Textarea } from "@/app/_components/Textarea";
import { useToast } from "@/app/_components/ToastProvider";
import { StandupCard } from "@/app/(app)/_components/StandupUi";
import { captureTimezone } from "@/app/_lib/timezone";
import { standupInputSchema } from "@/app/_lib/validation/standups";
import type { Standup } from "@/app/_lib/validation/responses";

type Draft = { yesterday: string; today: string; blockers: string };

const emptyDraft: Draft = { yesterday: "", today: "", blockers: "" };

async function submitStandup(path: string, method: "POST" | "PATCH", draft: Draft): Promise<Standup> {
  const body = standupInputSchema.parse({ ...draft, timezone: captureTimezone() });
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "Could not save your update.");
  }
  return response.json();
}

export function StandupForm({ current }: { current: Standup | null }) {
  const [update, setUpdate] = useState<Standup | null>(current);
  const [draft, setDraft] = useState<Draft>(current ?? emptyDraft);
  const [editing, setEditing] = useState(!current);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [optimisticUpdate, addOptimisticUpdate] = useOptimistic(
    update,
    (_current: Standup | null, next: Standup) => next,
  );
  const toast = useToast();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const parsed = standupInputSchema.safeParse({ ...draft, timezone: captureTimezone() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your update.");
      return;
    }

    startTransition(async () => {
      const optimistic: Standup = {
        id: update?.id ?? "pending",
        ...draft,
        submittedAtUtc: update?.submittedAtUtc ?? new Date().toISOString(),
        timezone: parsed.data.timezone,
        localStandupDate: update?.localStandupDate ?? new Date().toISOString(),
        editedAt: update ? new Date().toISOString() : null,
      };
      addOptimisticUpdate(optimistic);
      try {
        const saved = await submitStandup(update ? `/api/standups/${update.id}` : "/api/standups", update ? "PATCH" : "POST", draft);
        setUpdate(saved);
        setDraft(saved);
        setEditing(false);
        toast.push({ variant: "success", message: "Today's update is done." });
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Could not save your update.");
        toast.push({ variant: "error", message: "Your text is still here. Try saving again." });
      }
    });
  }

  if (!editing && optimisticUpdate) {
    return (
      <div className="space-y-4">
        <StandupCard update={optimisticUpdate} title="Today update - done" />
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Tweak today update
        </Button>
      </div>
    );
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{update ? "Edit today's update" : "Write today's update"}</h2>
        <p className="mt-1 text-sm text-neutral-500">Only one field is required. Blockers can stay empty.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Yesterday" htmlFor="yesterday">
          <Textarea id="yesterday" value={draft.yesterday} onChange={(event) => setDraft((value) => ({ ...value, yesterday: event.target.value }))} />
        </FormField>
        <FormField label="Today" htmlFor="today">
          <Textarea id="today" value={draft.today} onChange={(event) => setDraft((value) => ({ ...value, today: event.target.value }))} />
        </FormField>
        <FormField label="Blockers" htmlFor="blockers">
          <Textarea id="blockers" value={draft.blockers} onChange={(event) => setDraft((value) => ({ ...value, blockers: event.target.value }))} />
        </FormField>
        {error && <InlineError message={error} />}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" isLoading={isPending}>
            Save update
          </Button>
          {update && (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
